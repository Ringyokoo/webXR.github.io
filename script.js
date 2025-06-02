// script.js — рабочий FaceLandmarker + 3D-шляпа + безопасная трансформация
import vision from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
//============================================================================
// import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17/+esm';


// const guiParams = {
//     depth: 0.25,       // назад
//     height: 0,       // вверх
//     scale: 0.13,       // размер
//     faceScale: 2.1,     // масштаб координат
// };

// const gui = new GUI();
// gui.add(guiParams, 'depth', 0.0, 0.5, 0.01).name('DEPTH_OFFSET');
// gui.add(guiParams, 'height', -0.3, 0.3, 0.01).name('HEIGHT_OFFSET');
// gui.add(guiParams, 'scale', 0.05, 0.5, 0.01).name('MODEL_SCALE');
// gui.add(guiParams, 'faceScale', 0.5, 3.0, 0.01).name('SCALE');
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
            hat.position.set(0, 0, 0);
            hat.rotation.set(0, 0, 0);
            hat.scale.set(1, 1, 1);
            hat.matrixAutoUpdate = false;
            hat.visible = false;
            scene.add(hat);
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
        enableWebcamButton.innerText = "ENABLE WEBCAM5";
        video.srcObject?.getTracks().forEach(track => track.stop());
        return;
    }

    // Загружаем шляпу ДО старта камеры
    hatRef = await loadHat();

    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE5";

    const constraints = {
        video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: 16 / 9,
            facingMode: "user"
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
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const aspect = videoWidth / videoHeight;

    renderer.setSize(videoWidth, videoHeight, false);
    if (!camera) {
        camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        camera.position.set(0, 0, 1.2);
    }

    const container = document.getElementById("cameraContainer");
    container.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
    video.style.width = videoWidth + "px";
    video.style.height = videoHeight + "px";
    canvasElement.style.width = videoWidth + "px";
    canvasElement.style.height = videoHeight + "px";
    canvasElement.width = videoWidth;
    canvasElement.height = videoHeight;

    // if (hatGroup && !hatGroup.userData.initialized) {
    //     const loader = new GLTFLoader();
    //     loader.load('hat_glb_bej.glb', (gltf) => {
    //         const hat = gltf.scene;
    //         hat.name = "hat"; // если нужно потом найти
    //         scene.add(hat);
    //         hat.matrixAutoUpdate = false;
    //         hatRef = hat; // сохранить для обновлений
    //     });
    //     hatGroup.userData.initialized = true;
    // }
    if (!hatRef) {
        const loader = new GLTFLoader();
        loader.load('hat_glb_bej.glb', (gltf) => {
            const hat = gltf.scene;
            hat.name = "hat";
            hat.position.set(0, 0, 0);
            hat.rotation.set(0, 0, 0);
            hat.scale.set(1, 1, 1);
            hat.matrixAutoUpdate = false;
            hat.visible = false; // 👈 не показывать сразу
            scene.add(hat);
            hatRef = hat;
            console.log("Загружена модель:", gltf.scene);
            console.log("Дочерние объекты:", gltf.scene.children);

        });
    }

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

            const rotation = new THREE.Quaternion();
            const dummyPos = new THREE.Vector3();
            const dummyScale = new THREE.Vector3();
            matrix.decompose(dummyPos, rotation, dummyScale);

            // Дополнительный наклон шляпы "вперёд к камере"
            const headTiltAngle = THREE.MathUtils.degToRad(5); // 5° вперёд
            const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(1, 0, 0), // ось X
                headTiltAngle
            );

            // Итоговый поворот: сначала оригинальный, потом дополнительный наклон
            rotation.multiply(tiltQuaternion);


            // Ландмарки
            const landmarks = results.faceLandmarks[0];
            const head = landmarks[10];         // лоб
            const leftEar = landmarks[234];
            const rightEar = landmarks[454];

            // Масштаб координат лица
            const FACE_SCALE = 1.8;
            const headVec = new THREE.Vector3(
                (head.x - 0.5) * FACE_SCALE,
                -(head.y - 0.5) * FACE_SCALE,
                -head.z * FACE_SCALE
            );

            // Смещение вверх и назад (относительно головы)
            const rotMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rotation);
            const yAxis = new THREE.Vector3(0, 1, 0).applyMatrix4(rotMatrix).normalize();
            const zAxis = new THREE.Vector3(0, 0, 1).applyMatrix4(rotMatrix).normalize();

            const heightOffset = -0.05;
            const depthOffset = 0.22;
            const offset = yAxis.multiplyScalar(heightOffset).add(zAxis.multiplyScalar(-depthOffset));
            const finalPosition = headVec.clone().add(offset);

            // Масштаб по ширине головы (в плоскости XZ)
            const left = new THREE.Vector2(leftEar.x, leftEar.z);
            const right = new THREE.Vector2(rightEar.x, rightEar.z);
            const earDist = left.distanceTo(right);
            const BASE_WIDTH = 3.4;  // эмпирически подобрано
            const MODEL_SCALE = (earDist / BASE_WIDTH) * 1.5;

            // Финальная матрица
            const scale = new THREE.Vector3(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
            const poseMatrix = new THREE.Matrix4().compose(finalPosition, rotation, scale);
            console.log("✔️ applying pose", {
                pos: finalPosition,
                scale: scale,
                rotation: rotation,
            });
            if (!hatRef.visible) hatRef.visible = true;
            hatRef.matrixAutoUpdate = false;
            hatRef.matrix.copy(poseMatrix);
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

