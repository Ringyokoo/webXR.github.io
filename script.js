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
    height: 6.75,       // вверх по голове (ось Y)
    depth: 5.43,        // назад по голове (ось Z)
    scale: 2.4         // размер шляпы
};


const gui = new GUI();
gui.add(guiParams, 'height', -10, 10, 0.01).name('HEIGHT_OFFSET');
gui.add(guiParams, 'depth', 0, 10, 0.01).name('DEPTH_OFFSET');
gui.add(guiParams, 'scale', 0.1, 10, 0.01).name('MODEL_SCALE');

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

// if (!hatRef) {
//     const loader = new GLTFLoader();
//     loader.load('hat_glb_bej.glb', (gltf) => {
//         const hat = gltf.scene;
//         hat.name = "hat";
//         // hat.position.set(0, 0, 0);
//         // hat.rotation.set(0, 0, 0);
//         // hat.scale.set(1, 1, 1);
//         hat.matrixAutoUpdate = false;
//         hat.visible = false; // 👈 не показывать сразу
//         // === Вычисляем bounding box ===
//         const bbox = new THREE.Box3().setFromObject(hat);
//         const size = new THREE.Vector3();
//         bbox.getSize(size);

//         console.log("Размер шляпы в glb:", size);

//         scene.add(hat);
//         hatRef = hat;
//         console.log("Загружена модель:", gltf.scene);
//         console.log("Дочерние объекты:", gltf.scene.children);

//     });
// }



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
        camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 1000);
        camera.position.set(0, 0, 5);
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

            // Извлекаем только поворот и позицию (масштаб игнорируем)
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            matrix.decompose(position, rotation, new THREE.Vector3());

            // === 1. Смещение вверх вдоль локальной оси головы (ось Y в голове)
            // === Смещение вверх (по Y головы) и назад (по Z головы)
            const headUp = new THREE.Vector3(0, guiParams.height, 0).applyQuaternion(rotation);
            const headBack = new THREE.Vector3(0, 0, -guiParams.depth).applyQuaternion(rotation);
            const finalPosition = position.clone().add(headUp).add(headBack);

            // === 2. Добавляем лёгкий наклон головы вперёд (ось X)
            const pitchOffset = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(THREE.MathUtils.degToRad(1), 0, 0)
            );
            rotation.multiply(pitchOffset);

            // === 3. Сборка финальной матрицы с масштабом
            const poseMatrix = new THREE.Matrix4().compose(
                finalPosition,
                rotation,
                new THREE.Vector3(guiParams.scale, guiParams.scale, guiParams.scale)
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

