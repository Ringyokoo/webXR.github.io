// script.js — рабочий FaceLandmarker + 3D-шляпа + безопасная трансформация
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//============================================================================
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17/+esm';


// const guiParams = {
//     depth: 0.25,       // назад
//     height: 0,       // вверх
//     scale: 0.13,       // размер
//     faceScale: 2.1,     // масштаб координат
// };


const guiParams = {
    height: 13.41,       // вверх по голове (ось Y)
    depth: 7.27,        // назад по голове (ось Z)
    scale: 1.7,
};


const gui = new GUI();
gui.add(guiParams, 'height', 0, 30, 0.01).name('HEIGHT_OFFSET');
gui.add(guiParams, 'depth', 0, 10, 0.01).name('DEPTH_OFFSET');
gui.add(guiParams, 'scale', 0.1, 20, 0.01).name('MODEL_SCALE');


//============================================================================

const { FaceLandmarker, FilesetResolver, DrawingUtils } = vision;

const demosSection = document.getElementById("demos");
const toggleLandmarksButton = document.getElementById("toggleLandmarksButton");
const videoBlendShapes = document.getElementById("video-blend-shapes");
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("webcamButton");
const hatButton = document.getElementById("hatButton");
const overlay = document.getElementById("ar-overlay-container");

let faceLandmarker;
let runningMode = "IMAGE";
let webcamRunning = false;
let showLandmarks = false;


const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.classList.add("three-canvas");
overlay.appendChild(renderer.domElement);
let hatRef = null;

async function loadHat() {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();
        loader.load('hat_glb_bej.glb', (gltf) => {
            const hat = gltf.scene;
            hat.name = "hat";
            // hat.position.set(0, 0, 0);
            // hat.rotation.set(0, 0, 0);
            // hat.scale.set(1, 1, 1);
            // === Вычисляем bounding box ===
            const bbox = new THREE.Box3().setFromObject(hat);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            console.log("Размер шляпы в glb:", size);
            // === Вычисляем bounding box ===
            // hat.position.set(0,gui.height, 0);
            hat.matrixAutoUpdate = false;
            hat.visible = false;
            scene.add(hat);
            hatRef = hat;
            console.log("Загружена модель:", gltf.scene);
            console.log("Дочерние объекты:", gltf.scene.children);
            resolve(hat);
        });
    });
}




// Камера без точных параметров пока
let camera;
// let  = new THREE.Group();

function animate() {
    requestAnimationFrame(animate);
    if (camera) {
        renderer.render(scene, camera);
    }
}
animate(); // можно вызывать сразу

async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode,
        numFaces: 1
    });
    demosSection.classList.remove("invisible");
}
createFaceLandmarker();

if (navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}
toggleLandmarksButton.addEventListener("click", () => {
    showLandmarks = !showLandmarks;
});

if (navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}
// hatButton.addEventListener("click", () => {
//     hat.visible = !hat.visible;
// });

async function enableCam() {
    if (!faceLandmarker) return;

    // Остановка и удаление старой шляпы
    if (hatRef) {
        scene.remove(hatRef);
        hatRef = null;
    }

    // Остановка камеры, если уже запущена
    if (webcamRunning) {
        webcamRunning = false;
        enableWebcamButton.innerText = "ENABLE WEBCAM4444";
        video.srcObject?.getTracks().forEach(track => track.stop());
        return;
    }

    // Загружаем шляпу ДО старта камеры
    hatRef = await loadHat();

    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE4444";

    const constraints = {
        video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            aspectRatio: 4 / 3,
            facingMode: "user",
            resizeMode: "crop-and-scale"
        }
    };

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam, { once: true });
    });
}

let lastVideoTime = -1;
let results = undefined;
const drawingUtils = new DrawingUtils(canvasCtx);

async function predictWebcam() {

    const aspect = 4 / 3;
    // const videoHeight = video.clientHeight;
    const videoWidth = video.clientWidth;
    const videoHeight = videoWidth * 3 / 4;
    // console.log("videoWidth:", videoWidth, "videoHeight:", videoHeight);

    // if (videoHeight > videoWidth && window.innerWidth < window.innerHeight) {
    //     // принудительно переворачиваем размеры
    //     [videoWidth, videoHeight] = [videoHeight, videoWidth];
    // }


    renderer.setSize(videoWidth, videoHeight, false);
    if (!camera) {
        camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
        camera.position.set(0, 0, 5);
    }

    canvasElement.style.width = videoWidth + "px";
    canvasElement.style.height = videoHeight + "px";
    canvasElement.width = videoWidth;
    canvasElement.height = videoHeight;


    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await faceLandmarker.setOptions({ runningMode });
        return requestAnimationFrame(predictWebcam);
    }

    const startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = faceLandmarker.detectForVideo(video, startTimeMs);
    }

    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results?.faceLandmarks?.length) {
        if (showLandmarks) {
            for (const landmarks of results.faceLandmarks) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#C0C0C070" });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: "#E0E0E0" });
            }
        }
        if (!hatRef || !results?.faceLandmarks?.length) return;

        const matrixRaw = results.facialTransformationMatrixes?.[0]?.data;
        if (matrixRaw && matrixRaw.every(Number.isFinite)) {

            const matrix = new THREE.Matrix4().fromArray(matrixRaw);
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            matrix.decompose(position, rotation, new THREE.Vector3());

            const fovRad = camera.fov * Math.PI / 180;
            const sceneHeightAtZ = 2 * Math.tan(fovRad / 2) * camera.position.z;


            // === Размер головы (на экране)
            // const l10 = results.faceLandmarks[0][10];
            // const l152 = results.faceLandmarks[0][152];
            // const faceHeightND = Math.abs(l10.y - l152.y);
            // const faceScaleFactor = 1 / faceHeightND;
            const l10 = results.faceLandmarks[0][10];
            const l152 = results.faceLandmarks[0][152];
            const faceHeightND = Math.abs(l10.y - l152.y);

            // теперь нормальный scaleFactor
            const faceHeightInScene = faceHeightND * sceneHeightAtZ;
            const faceScaleFactor = 1 / faceHeightInScene;


            // === Динамика
            const dynamicScale = guiParams.scale * 1 / faceScaleFactor;
            const dynamicHeight = guiParams.height * faceScaleFactor * 0.75;

            // === Смещения
            const headUp = new THREE.Vector3(0, dynamicHeight, 0).applyQuaternion(rotation);
            const headBack = new THREE.Vector3(0, 0, -guiParams.depth).applyQuaternion(rotation);
            const finalPosition = position.clone().add(headUp).add(headBack);

            // === Наклон
            const pitchOffset = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(THREE.MathUtils.degToRad(1), 0, 0)
            );
            rotation.multiply(pitchOffset);

            // === Сборка матрицы
            const poseMatrix = new THREE.Matrix4().compose(
                finalPosition,
                rotation,
                new THREE.Vector3(dynamicScale, dynamicScale, dynamicScale)
            );

            hatRef.matrixAutoUpdate = false;
            hatRef.matrix.copy(poseMatrix);
            hatRef.visible = true;

        }

    }

    if (webcamRunning) window.requestAnimationFrame(predictWebcam);
}


// освещение
// Создаём новое освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);  // Более яркий общий свет
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);  // Ещё ярче
directionalLight.position.set(5, 8, 6);  // Выше и спереди для равномерного освещения
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);  // Усиленный заполняющий свет
fillLight.position.set(-3, 2, -4);  // Слева и сзади
scene.add(fillLight);


const originalLog = console.log;
console.log = function (...args) {
    if (args[0]?.includes?.("Graph successfully started running")) {
        document.getElementById("loadingOverlay").style.display = "none";
    }
    originalLog.apply(console, args);
};

