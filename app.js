const storageKeys = {
  students: 'faceapp_students',
  schedules: 'faceapp_schedules',
  attendance: 'faceapp_attendance',
  unknown: 'faceapp_unknown_faces'
};

const state = {
  students: load(storageKeys.students, []),
  schedules: load(storageKeys.schedules, []),
  attendance: load(storageKeys.attendance, []),
  unknownFaces: load(storageKeys.unknown, []),
  stream: null,
  isScanning: false,
  scanIntervalId: null,
  detector: 'FaceDetector' in window ? new FaceDetector({ fastMode: true, maxDetectedFaces: 10 }) : null,
  zoom: 1,
  unknownBuffer: {}
};

const el = {
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  cameraSelect: document.getElementById('cameraSelect'),
  refreshCameras: document.getElementById('refreshCameras'),
  startCamera: document.getElementById('startCamera'),
  startScan: document.getElementById('startScan'),
  stopScan: document.getElementById('stopScan'),
  scanStart: document.getElementById('scanStart'),
  scanEnd: document.getElementById('scanEnd'),
  studentForm: document.getElementById('studentForm'),
  studentId: document.getElementById('studentId'),
  studentName: document.getElementById('studentName'),
  studentsList: document.getElementById('studentsList'),
  sampleStudent: document.getElementById('sampleStudent'),
  captureSample: document.getElementById('captureSample'),
  sampleUpload: document.getElementById('sampleUpload'),
  scheduleForm: document.getElementById('scheduleForm'),
  courseName: document.getElementById('courseName'),
  groupName: document.getElementById('groupName'),
  roomName: document.getElementById('roomName'),
  lessonStart: document.getElementById('lessonStart'),
  lessonEnd: document.getElementById('lessonEnd'),
  scheduleList: document.getElementById('scheduleList'),
  attendanceBody: document.getElementById('attendanceBody'),
  unknownGallery: document.getElementById('unknownGallery'),
  studentItemTemplate: document.getElementById('studentItemTemplate')
};

init();

function init() {
  bindEvents();
  renderAll();
  listCameras();
}

function bindEvents() {
  el.refreshCameras.addEventListener('click', listCameras);
  el.startCamera.addEventListener('click', startCamera);
  el.startScan.addEventListener('click', startScan);
  el.stopScan.addEventListener('click', stopScan);

  el.studentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const student = {
      id: el.studentId.value.trim(),
      name: el.studentName.value.trim(),
      samples: []
    };

    if (!student.id || !student.name) return;
    if (state.students.some((s) => s.id === student.id)) {
      alert('Bu ID allaqachon mavjud.');
      return;
    }

    state.students.push(student);
    persist(storageKeys.students, state.students);
    el.studentForm.reset();
    renderStudents();
  });

  el.captureSample.addEventListener('click', async () => {
    const studentId = el.sampleStudent.value;
    if (!studentId) return alert('Talabani tanlang.');
    const frame = captureFrame();
    if (!frame) return alert('Kamera yoqilmagan.');
    await addSample(studentId, frame.dataUrl);
  });

  el.sampleUpload.addEventListener('change', async (e) => {
    const studentId = el.sampleStudent.value;
    if (!studentId) return alert('Avval talabani tanlang.');
    const files = [...e.target.files];
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      await addSample(studentId, dataUrl);
    }
    e.target.value = '';
  });

  el.scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.schedules.push({
      id: crypto.randomUUID(),
      course: el.courseName.value,
      group: el.groupName.value,
      room: el.roomName.value,
      start: el.lessonStart.value,
      end: el.lessonEnd.value
    });
    persist(storageKeys.schedules, state.schedules);
    el.scheduleForm.reset();
    renderSchedules();
  });
}

async function listCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    el.cameraSelect.innerHTML = cameras
      .map((cam, index) => `<option value="${cam.deviceId}">${cam.label || `Kamera ${index + 1}`}</option>`)
      .join('');
  } catch (err) {
    alert(`Kamera ro'yxatini olishda xatolik: ${err.message}`);
  }
}

async function startCamera() {
  stopStream();
  const deviceId = el.cameraSelect.value;
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    el.video.srcObject = state.stream;
    await el.video.play();
    resizeCanvas();
  } catch (err) {
    alert(`Kamerani yoqib bo'lmadi: ${err.message}`);
  }
}

function resizeCanvas() {
  el.overlay.width = el.video.videoWidth || 1280;
  el.overlay.height = el.video.videoHeight || 720;
}

function startScan() {
  if (!state.stream) {
    alert('Avval kamerani ishga tushiring.');
    return;
  }

  if (state.isScanning) return;
  state.isScanning = true;

  state.scanIntervalId = setInterval(scanTick, 1200);
}

function stopScan() {
  state.isScanning = false;
  if (state.scanIntervalId) {
    clearInterval(state.scanIntervalId);
    state.scanIntervalId = null;
  }
  clearOverlay();
}

async function scanTick() {
  if (!withinScanWindow(el.scanStart.value, el.scanEnd.value)) {
    return;
  }

  const frame = captureFrame();
  if (!frame) return;

  const faces = await detectFaces(frame.canvas);
  drawFaces(faces);
  applyAdaptiveZoom(faces, frame.canvas.width * frame.canvas.height);

  for (const face of faces) {
    const crop = cropFace(frame.canvas, face.boundingBox);
    const embedding = await vectorize(crop);
    const match = findBestMatch(embedding);

    if (match && match.score >= 0.94) {
      markAttendance(match.student, match.score);
    } else {
      await saveUnknownFace(crop, embedding);
    }
  }

  renderAll();
}

async function detectFaces(sourceCanvas) {
  if (state.detector) {
    try {
      return await state.detector.detect(sourceCanvas);
    } catch {
      return [];
    }
  }

  return [{
    boundingBox: {
      x: sourceCanvas.width * 0.3,
      y: sourceCanvas.height * 0.2,
      width: sourceCanvas.width * 0.4,
      height: sourceCanvas.height * 0.6
    }
  }];
}

function applyAdaptiveZoom(faces, frameArea) {
  if (!faces.length) return;

  const ratios = faces.map((f) => (f.boundingBox.width * f.boundingBox.height) / frameArea);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  if (mean < 0.03) state.zoom = Math.min(2.4, state.zoom + 0.08);
  if (mean > 0.22) state.zoom = Math.max(1, state.zoom - 0.08);

  el.video.style.transform = `scale(${state.zoom.toFixed(2)})`;
}

function drawFaces(faces) {
  const ctx = el.overlay.getContext('2d');
  clearOverlay();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#22c55e';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#22c55e';

  faces.forEach((f, idx) => {
    const { x, y, width, height } = f.boundingBox;
    ctx.strokeRect(x, y, width, height);
    ctx.fillText(`Face ${idx + 1}`, x, Math.max(12, y - 5));
  });
}

function clearOverlay() {
  const ctx = el.overlay.getContext('2d');
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
}

function captureFrame() {
  if (!el.video.videoWidth || !el.video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = el.video.videoWidth;
  canvas.height = el.video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(el.video, 0, 0, canvas.width, canvas.height);
  return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
}

function cropFace(sourceCanvas, box) {
  const c = document.createElement('canvas');
  c.width = Math.max(48, Math.floor(box.width));
  c.height = Math.max(48, Math.floor(box.height));
  const ctx = c.getContext('2d');
  ctx.drawImage(
    sourceCanvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    c.width,
    c.height
  );
  return c;
}

async function addSample(studentId, dataUrl) {
  const student = state.students.find((s) => s.id === studentId);
  if (!student) return;

  const img = await imageFromDataUrl(dataUrl);
  const embedding = await vectorize(img);
  student.samples.push({
    id: crypto.randomUUID(),
    dataUrl,
    embedding
  });

  persist(storageKeys.students, state.students);
  renderStudents();
}

function findBestMatch(embedding) {
  let best = null;

  for (const student of state.students) {
    for (const sample of student.samples) {
      const score = cosineSimilarity(embedding, sample.embedding);
      if (!best || score > best.score) {
        best = { student, score };
      }
    }
  }

  return best;
}

function markAttendance(student, confidence) {
  const now = new Date();
  const alreadySeen = state.attendance.some((row) => {
    const sameStudent = row.studentId === student.id;
    const sameDay = new Date(row.time).toDateString() === now.toDateString();
    return sameStudent && sameDay;
  });

  if (alreadySeen) return;

  state.attendance.unshift({
    id: crypto.randomUUID(),
    time: now.toISOString(),
    studentId: student.id,
    studentName: student.name,
    state: 'Present',
    confidence
  });

  persist(storageKeys.attendance, state.attendance);
}

async function saveUnknownFace(canvas, embedding) {
  const key = hashVector(embedding).slice(0, 16);
  const count = state.unknownBuffer[key] || 0;
  if (count >= 3) return;

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  state.unknownFaces.unshift({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    dataUrl,
    vector: embedding
  });

  state.unknownBuffer[key] = count + 1;
  persist(storageKeys.unknown, state.unknownFaces.slice(0, 200));
}

function renderAll() {
  renderStudents();
  renderSchedules();
  renderAttendance();
  renderUnknown();
}

function renderStudents() {
  el.studentsList.innerHTML = '';
  el.sampleStudent.innerHTML = '<option value="">Tanlang</option>';

  state.students.forEach((student) => {
    const node = el.studentItemTemplate.content.cloneNode(true);
    node.querySelector('.name').textContent = `${student.name} (${student.id})`;
    node.querySelector('.meta').textContent = `Namuna: ${student.samples.length} ta`;
    node.querySelector('.delete').addEventListener('click', () => {
      state.students = state.students.filter((s) => s.id !== student.id);
      persist(storageKeys.students, state.students);
      renderStudents();
    });
    el.studentsList.appendChild(node);

    const option = document.createElement('option');
    option.value = student.id;
    option.textContent = `${student.name} (${student.id})`;
    el.sampleStudent.appendChild(option);
  });
}

function renderSchedules() {
  el.scheduleList.innerHTML = '';
  state.schedules.forEach((schedule) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${schedule.course} (${schedule.group})</strong>
        <div class="meta">Xona: ${schedule.room} | ${schedule.start} - ${schedule.end}</div>
      </div>
      <div class="actions">
        <button class="delete">O'chirish</button>
      </div>
    `;

    li.querySelector('.delete').addEventListener('click', () => {
      state.schedules = state.schedules.filter((s) => s.id !== schedule.id);
      persist(storageKeys.schedules, state.schedules);
      renderSchedules();
    });
    el.scheduleList.appendChild(li);
  });
}

function renderAttendance() {
  el.attendanceBody.innerHTML = state.attendance
    .slice(0, 40)
    .map((row) => `
      <tr>
        <td>${new Date(row.time).toLocaleTimeString()}</td>
        <td>${row.studentName}</td>
        <td>${row.studentId}</td>
        <td>${row.state}</td>
        <td>${(row.confidence * 100).toFixed(1)}%</td>
      </tr>
    `)
    .join('');
}

function renderUnknown() {
  el.unknownGallery.innerHTML = state.unknownFaces
    .slice(0, 18)
    .map((face) => `<img src="${face.dataUrl}" alt="Unknown ${face.id}" title="${new Date(face.time).toLocaleString()}" />`)
    .join('');
}

function withinScanWindow(start, end) {
  if (!start || !end) return true;
  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  const startDate = new Date(now);
  startDate.setHours(sh, sm, 0, 0);

  const endDate = new Date(now);
  endDate.setHours(eh, em, 59, 999);

  return now >= startDate && now <= endDate;
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

function stopStream() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
}

async function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
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

async function vectorize(imageSource) {
  const w = 16;
  const h = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageSource, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const vector = [];

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 / 255;
    vector.push(gray);
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function hashVector(v) {
  return v.map((n) => Math.round(n * 15).toString(16)).join('');
}

window.addEventListener('beforeunload', () => {
  stopScan();
  stopStream();
});
