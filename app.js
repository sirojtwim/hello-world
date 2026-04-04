const KEYS = {
  students: 'faceapp_students',
  schedules: 'faceapp_schedules',
  attendance: 'faceapp_attendance',
  unknown: 'faceapp_unknown_faces',
  settings: 'faceapp_settings'
};

const ui = {
  tabs: [...document.querySelectorAll('.tab')],
  panels: [...document.querySelectorAll('.tab-panel')],
  cameraSelect: document.getElementById('cameraSelect'),
  facingModeSelect: document.getElementById('facingModeSelect'),
  resolutionSelect: document.getElementById('resolutionSelect'),
  refreshCameras: document.getElementById('refreshCameras'),
  startCamera: document.getElementById('startCamera'),
  switchCamera: document.getElementById('switchCamera'),
  startScan: document.getElementById('startScan'),
  stopScan: document.getElementById('stopScan'),
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  scanStart: document.getElementById('scanStart'),
  scanEnd: document.getElementById('scanEnd'),
  scanStatus: document.getElementById('scanStatus'),
  testModeToggle: document.getElementById('testModeToggle'),
  runDiagnostics: document.getElementById('runDiagnostics'),
  diagnosticsOutput: document.getElementById('diagnosticsOutput'),
  detectorStatus: document.getElementById('detectorStatus'),
  zoomStatus: document.getElementById('zoomStatus'),
  studentForm: document.getElementById('studentForm'),
  studentId: document.getElementById('studentId'),
  studentName: document.getElementById('studentName'),
  sampleStudent: document.getElementById('sampleStudent'),
  sampleUpload: document.getElementById('sampleUpload'),
  captureSample: document.getElementById('captureSample'),
  studentsList: document.getElementById('studentsList'),
  studentItemTemplate: document.getElementById('studentItemTemplate'),
  scheduleForm: document.getElementById('scheduleForm'),
  courseName: document.getElementById('courseName'),
  groupName: document.getElementById('groupName'),
  roomName: document.getElementById('roomName'),
  lessonStart: document.getElementById('lessonStart'),
  lessonEnd: document.getElementById('lessonEnd'),
  scheduleList: document.getElementById('scheduleList'),
  attendanceBody: document.getElementById('attendanceBody'),
  unknownGallery: document.getElementById('unknownGallery')
};

const app = {
  students: load(KEYS.students, []),
  schedules: load(KEYS.schedules, []),
  attendance: load(KEYS.attendance, []),
  unknown: load(KEYS.unknown, []),
  settings: load(KEYS.settings, { testMode: false }),
  stream: null,
  scanTimer: null,
  isScanning: false,
  zoom: 1,
  unknownCounter: {},
  detector: 'FaceDetector' in window ? new FaceDetector({ fastMode: true, maxDetectedFaces: 10 }) : null
};

initialize();

function initialize() {
  bindTabNavigation();
  bindScanControls();
  bindStudentControls();
  bindScheduleControls();
  bindDiagnostics();
  applySettingsToUI();
  renderAll();
  listCameras();
}

function bindTabNavigation() {
  ui.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      ui.tabs.forEach((t) => t.classList.remove('active'));
      ui.panels.forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

function bindScanControls() {
  ui.refreshCameras.addEventListener('click', listCameras);
  ui.startCamera.addEventListener('click', startCamera);
  ui.switchCamera.addEventListener('click', switchCamera);
  ui.startScan.addEventListener('click', startScan);
  ui.stopScan.addEventListener('click', stopScan);

  ui.testModeToggle.addEventListener('change', () => {
    app.settings.testMode = ui.testModeToggle.checked;
    persist(KEYS.settings, app.settings);
    setStatus(app.settings.testMode ? 'Holat: test rejimi yoqildi.' : 'Holat: oddiy rejim.');
  });

  window.addEventListener('resize', syncCanvasSize);
  window.addEventListener('orientationchange', () => {
    if (app.stream) setTimeout(syncCanvasSize, 250);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.isScanning) {
      stopScan();
      setStatus('Holat: fon rejimiga o‘tgani uchun skaner to‘xtatildi.');
    }
  });
}

function bindStudentControls() {
  ui.studentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = ui.studentId.value.trim();
    const name = ui.studentName.value.trim();

    if (!id || !name) return;
    if (app.students.some((item) => item.id === id)) {
      alert('Talaba ID allaqachon mavjud.');
      return;
    }

    app.students.push({ id, name, samples: [] });
    persist(KEYS.students, app.students);
    ui.studentForm.reset();
    renderStudents();
  });

  ui.sampleUpload.addEventListener('change', async (event) => {
    const studentId = ui.sampleStudent.value;
    if (!studentId) return alert('Avval talabani tanlang.');

    for (const file of [...event.target.files]) {
      const dataUrl = await fileToDataUrl(file);
      await addSampleToStudent(studentId, dataUrl);
    }

    ui.sampleUpload.value = '';
  });

  ui.captureSample.addEventListener('click', async () => {
    const studentId = ui.sampleStudent.value;
    if (!studentId) return alert('Talabani tanlang.');

    const frame = captureFrame();
    if (!frame) return alert('Kamera yoqilmagan.');
    await addSampleToStudent(studentId, frame.dataUrl);
  });
}

function bindScheduleControls() {
  ui.scheduleForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const schedule = {
      id: crypto.randomUUID(),
      course: ui.courseName.value.trim(),
      group: ui.groupName.value.trim(),
      room: ui.roomName.value.trim(),
      start: ui.lessonStart.value,
      end: ui.lessonEnd.value
    };

    if (!schedule.course || !schedule.group || !schedule.room || !schedule.start || !schedule.end) return;
    app.schedules.push(schedule);
    persist(KEYS.schedules, app.schedules);
    ui.scheduleForm.reset();
    renderSchedules();
  });
}

function bindDiagnostics() {
  ui.runDiagnostics.addEventListener('click', async () => {
    const results = [];

    results.push(check('Talabalar ro\'yxati yuklangan', Array.isArray(app.students)));
    results.push(check('Jadval ro\'yxati yuklangan', Array.isArray(app.schedules)));
    results.push(check('Davomat ro\'yxati yuklangan', Array.isArray(app.attendance)));
    results.push(check('Unknown ro\'yxati yuklangan', Array.isArray(app.unknown)));
    results.push(check('FaceDetector holati aniqlangan', typeof app.detector !== 'undefined'));
    results.push(check('mediaDevices mavjud', !!navigator.mediaDevices));
    results.push(check('Xavfsiz kontekst (HTTPS/localhost)', window.isSecureContext || window.location.hostname === 'localhost'));

    const vectorA = await vectorize(await imageFromCanvasColor('#ffffff'));
    const vectorB = await vectorize(await imageFromCanvasColor('#ffffff'));
    const vectorC = await vectorize(await imageFromCanvasColor('#000000'));
    results.push(check('Cosine similarity bir xil rasmda yuqori', cosineSimilarity(vectorA, vectorB) > 0.99));
    results.push(check('Cosine similarity turli rasmda pastroq', cosineSimilarity(vectorA, vectorC) < 0.99));
    results.push(check('Skan vaqt tekshiruvi ishlayapti', typeof withinWindow('00:00', '23:59', new Date()) === 'boolean'));

    ui.diagnosticsOutput.textContent = results.join('\n');
  });
}

async function listCameras() {
  try {
    const temp = await navigator.mediaDevices.getUserMedia({ video: true });
    temp.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');

    ui.cameraSelect.innerHTML = cameras
      .map((camera, idx) => `<option value="${camera.deviceId}">${camera.label || `Kamera ${idx + 1}`}</option>`)
      .join('');

    if (!cameras.length) setStatus('Holat: kamera topilmadi.');
  } catch (error) {
    setStatus(`Holat: ${cameraErrorMessage(error)}`);
  }
}

async function startCamera() {
  if (app.settings.testMode) {
    setStatus('Holat: test rejimida real kamera kerak emas.');
    return;
  }

  stopStream();
  const id = ui.cameraSelect.value;
  const [width, height] = ui.resolutionSelect.value.split('x').map(Number);
  const preferredFacingMode = ui.facingModeSelect.value;

  try {
    app.stream = await getCameraStream({
      deviceId: id,
      width,
      height,
      facingMode: preferredFacingMode
    });

    ui.video.srcObject = app.stream;
    ui.video.onloadedmetadata = () => syncCanvasSize();
    await ui.video.play();
    syncCanvasSize();
    setStatus('Holat: kamera ishga tushdi.');
  } catch (error) {
    setStatus(`Holat: ${cameraErrorMessage(error)}`);
  }
}

async function switchCamera() {
  const options = [...ui.cameraSelect.options];
  if (options.length < 2) {
    setStatus('Holat: almashtirish uchun kamida 2 ta kamera kerak.');
    return;
  }

  const current = ui.cameraSelect.selectedIndex;
  ui.cameraSelect.selectedIndex = (current + 1) % options.length;
  await startCamera();
}

function startScan() {
  if (!app.settings.testMode && !app.stream) {
    alert('Avval kamerani ishga tushiring yoki test rejimini yoqing.');
    return;
  }

  if (app.isScanning) return;
  app.isScanning = true;
  app.scanTimer = setInterval(scanCycle, 1200);
  setStatus('Holat: skanerlash boshlandi.');
}

function stopScan() {
  app.isScanning = false;
  if (app.scanTimer) clearInterval(app.scanTimer);
  app.scanTimer = null;
  clearOverlay();
  setStatus('Holat: skanerlash to\'xtatildi.');
}

async function scanCycle() {
  if (!withinWindow(ui.scanStart.value, ui.scanEnd.value, new Date())) return;

  const frame = app.settings.testMode ? createMockFrame() : captureFrame();
  if (!frame) return;

  const faces = app.settings.testMode ? mockFaces(frame.canvas) : await detectFaces(frame.canvas);
  drawOverlay(faces);
  tuneZoom(faces, frame.canvas.width * frame.canvas.height);

  for (const face of faces) {
    const crop = cropFace(frame.canvas, face.boundingBox);
    const embedding = await vectorize(crop);
    const match = findBestMatch(embedding);

    if (match && match.score >= 0.94) {
      pushAttendance(match.student, match.score);
    } else {
      pushUnknown(crop, embedding);
    }
  }

  renderReports();
}

async function detectFaces(canvas) {
  if (!app.detector) return mockFaces(canvas);

  try {
    return await app.detector.detect(canvas);
  } catch {
    return [];
  }
}

function mockFaces(canvas) {
  return [{
    boundingBox: {
      x: canvas.width * 0.3,
      y: canvas.height * 0.2,
      width: canvas.width * 0.35,
      height: canvas.height * 0.5
    }
  }];
}

function tuneZoom(faces, frameArea) {
  if (!faces.length) return;

  const avg = faces
    .map((face) => (face.boundingBox.width * face.boundingBox.height) / frameArea)
    .reduce((sum, value) => sum + value, 0) / faces.length;

  if (avg < 0.035) app.zoom = Math.min(2.5, app.zoom + 0.07);
  if (avg > 0.2) app.zoom = Math.max(1, app.zoom - 0.07);

  ui.video.style.transform = `scale(${app.zoom.toFixed(2)})`;
  ui.zoomStatus.textContent = app.zoom.toFixed(2);
}

function drawOverlay(faces) {
  const ctx = ui.overlay.getContext('2d');
  clearOverlay();
  ctx.strokeStyle = '#53d37a';
  ctx.fillStyle = '#53d37a';
  ctx.lineWidth = 2;
  ctx.font = '13px sans-serif';

  faces.forEach((face, index) => {
    const { x, y, width, height } = face.boundingBox;
    ctx.strokeRect(x, y, width, height);
    ctx.fillText(`Face ${index + 1}`, x, Math.max(14, y - 7));
  });
}

function clearOverlay() {
  const ctx = ui.overlay.getContext('2d');
  ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
}

function captureFrame() {
  if (!ui.video.videoWidth || !ui.video.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = ui.video.videoWidth;
  canvas.height = ui.video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(ui.video, 0, 0, canvas.width, canvas.height);

  return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
}

function createMockFrame() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#2a3357');
  gradient.addColorStop(1, '#101726');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#f7d6bf';
  ctx.beginPath();
  ctx.ellipse(320, 140, 75, 95, 0, 0, 2 * Math.PI);
  ctx.fill();

  return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
}

function cropFace(canvas, box) {
  const output = document.createElement('canvas');
  output.width = Math.max(48, Math.floor(box.width));
  output.height = Math.max(48, Math.floor(box.height));
  const ctx = output.getContext('2d');
  ctx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, output.width, output.height);
  return output;
}

async function addSampleToStudent(studentId, dataUrl) {
  const student = app.students.find((item) => item.id === studentId);
  if (!student) return;

  const image = await imageFromDataUrl(dataUrl);
  const embedding = await vectorize(image);
  student.samples.push({ id: crypto.randomUUID(), dataUrl, embedding });

  persist(KEYS.students, app.students);
  renderStudents();
}

function findBestMatch(embedding) {
  let best = null;

  for (const student of app.students) {
    for (const sample of student.samples) {
      const score = cosineSimilarity(embedding, sample.embedding);
      if (!best || score > best.score) best = { student, score };
    }
  }

  return best;
}

function pushAttendance(student, confidence) {
  const now = new Date();
  const duplicate = app.attendance.some((row) => {
    return row.studentId === student.id && new Date(row.time).toDateString() === now.toDateString();
  });

  if (duplicate) return;

  app.attendance.unshift({
    id: crypto.randomUUID(),
    time: now.toISOString(),
    studentId: student.id,
    studentName: student.name,
    state: 'Present',
    confidence
  });

  persist(KEYS.attendance, app.attendance);
}

function pushUnknown(canvas, embedding) {
  const key = hashVector(embedding).slice(0, 16);
  app.unknownCounter[key] = (app.unknownCounter[key] || 0) + 1;
  if (app.unknownCounter[key] > 3) return;

  app.unknown.unshift({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    dataUrl: canvas.toDataURL('image/jpeg', 0.85)
  });

  app.unknown = app.unknown.slice(0, 200);
  persist(KEYS.unknown, app.unknown);
}

function renderAll() {
  renderStudents();
  renderSchedules();
  renderReports();
  ui.detectorStatus.textContent = app.detector ? 'Mavjud' : 'Mavjud emas (fallback)';
}

function renderStudents() {
  ui.studentsList.innerHTML = '';
  ui.sampleStudent.innerHTML = '<option value="">Talabani tanlang</option>';

  app.students.forEach((student) => {
    const node = ui.studentItemTemplate.content.cloneNode(true);
    node.querySelector('.name').textContent = `${student.name} (${student.id})`;
    node.querySelector('.meta').textContent = `Namuna soni: ${student.samples.length}`;
    node.querySelector('.delete').addEventListener('click', () => {
      app.students = app.students.filter((item) => item.id !== student.id);
      persist(KEYS.students, app.students);
      renderStudents();
    });

    ui.studentsList.appendChild(node);

    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.id})`;
    ui.sampleStudent.appendChild(option);
  });
}

function renderSchedules() {
  ui.scheduleList.innerHTML = '';

  app.schedules.forEach((schedule) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${schedule.course} (${schedule.group})</strong>
        <div class="meta">Xona: ${schedule.room} | ${schedule.start} - ${schedule.end}</div>
      </div>
      <button class="delete">O'chirish</button>
    `;

    li.querySelector('.delete').addEventListener('click', () => {
      app.schedules = app.schedules.filter((item) => item.id !== schedule.id);
      persist(KEYS.schedules, app.schedules);
      renderSchedules();
    });

    ui.scheduleList.appendChild(li);
  });
}

function renderReports() {
  ui.attendanceBody.innerHTML = app.attendance
    .slice(0, 60)
    .map((row) => {
      return `
        <tr>
          <td>${new Date(row.time).toLocaleTimeString()}</td>
          <td>${row.studentName}</td>
          <td>${row.studentId}</td>
          <td>${row.state}</td>
          <td>${(row.confidence * 100).toFixed(1)}%</td>
        </tr>
      `;
    })
    .join('');

  ui.unknownGallery.innerHTML = app.unknown
    .slice(0, 18)
    .map((item) => `<img src="${item.dataUrl}" alt="Unknown ${item.id}" title="${new Date(item.time).toLocaleString()}" />`)
    .join('');
}

function withinWindow(start, end, now) {
  if (!start || !end) return true;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  const s = new Date(now);
  s.setHours(startHour, startMinute, 0, 0);

  const e = new Date(now);
  e.setHours(endHour, endMinute, 59, 999);

  if (e < s) {
    return now >= s || now <= e;
  }

  return now >= s && now <= e;
}

function syncCanvasSize() {
  const width = ui.video.videoWidth || 1280;
  const height = ui.video.videoHeight || 720;
  ui.overlay.width = width;
  ui.overlay.height = height;
}

function stopStream() {
  if (!app.stream) return;
  app.stream.getTracks().forEach((track) => track.stop());
  app.stream = null;
}

function setStatus(message) {
  ui.scanStatus.textContent = message;
}

async function getCameraStream({ deviceId, width, height, facingMode }) {
  const primaryConstraints = {
    video: {
      width: { ideal: width },
      height: { ideal: height },
      facingMode: { ideal: facingMode },
      deviceId: deviceId ? { exact: deviceId } : undefined
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (primaryError) {
    const fallbackConstraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: facingMode ? { ideal: facingMode } : undefined
      }
    };

    try {
      return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    } catch (fallbackError) {
      throw fallbackError || primaryError;
    }
  }
}

function cameraErrorMessage(error) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'Brauzer kamerani qo‘llamaydi. Chrome/Edge/Safari yangi versiyasini ishlating.';
  }

  const name = error?.name || '';
  if (name === 'NotAllowedError') {
    return 'Kamera ruxsati berilmagan. Brauzer sozlamasida camera permission ni yoqing.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Kamera topilmadi. Telefon/USB kamerani tekshiring.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kamera band. Boshqa ilovani yoping (Zoom/Meet/Telegram) va qayta urinib ko‘ring.';
  }
  if (name === 'OverconstrainedError') {
    return 'Tanlangan sifat kameraga mos emas. SD (640x480) ni tanlab qayta urinib ko‘ring.';
  }
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    return 'Telefonlarda kamera uchun HTTPS kerak. HTTPS yoki localhost orqali oching.';
  }
  return `Kamera xatosi: ${error?.message || 'Nomaʼlum xato'}`;
}

function applySettingsToUI() {
  ui.testModeToggle.checked = !!app.settings.testMode;
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function vectorize(source) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, 16, 16);
  const pixels = ctx.getImageData(0, 0, 16, 16).data;

  const vector = [];
  for (let i = 0; i < pixels.length; i += 4) {
    vector.push(((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3) / 255);
  }

  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function hashVector(vector) {
  return vector.map((value) => Math.round(value * 15).toString(16)).join('');
}

function check(name, isPass) {
  return `${isPass ? '✅' : '❌'} ${name}`;
}

async function imageFromCanvasColor(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

window.addEventListener('beforeunload', () => {
  stopScan();
  stopStream();
});
