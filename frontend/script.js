const imageInput = document.getElementById('imageInput');
const browseButton = document.getElementById('browseButton');
const uploadArea = document.getElementById('uploadArea');
const uploadContent = document.getElementById('uploadContent');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const predictButton = document.getElementById('predictButton');
const removeImage = document.getElementById('removeImage');
const resetButton = document.getElementById('resetButton');
const message = document.getElementById('message');
const results = document.getElementById('results');
const resultList = document.getElementById('resultList');
const resultTag = document.getElementById('resultTag');

let selectedImage = null;
let previewURL = null;
const damageClasses = ['Dent', 'Scratch', 'Crack', 'Glass Shatter', 'Lamp Broken', 'Tire Flat'];
const thresholds = [0.60, 0.38, 0.27, 0.64, 0.39, 0.42];

const API_URL = '/predict';

browseButton.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => { if (imageInput.files[0]) handleImage(imageInput.files[0]); });

function handleImage(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) { alert('Please upload a JPG or PNG image.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Image size must be 10 MB or less.'); return; }
  selectedImage = file;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(file);
  imagePreview.src = previewURL;
  uploadContent.classList.add('hidden');
  previewContainer.classList.remove('hidden');
  predictButton.disabled = false;
  results.classList.add('hidden');
  message.textContent = 'Image uploaded successfully. Ready for inspection.';
}

function resetPage() {
  selectedImage = null;
  imageInput.value = '';
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
  imagePreview.removeAttribute('src');
  uploadContent.classList.remove('hidden');
  previewContainer.classList.add('hidden');
  predictButton.disabled = true;
  predictButton.textContent = 'Predict damage ↗';
  results.classList.add('hidden');
  resultList.replaceChildren();
  message.textContent = 'Upload an image to enable prediction.';
}
removeImage.addEventListener('click', resetPage);
resetButton.addEventListener('click', resetPage);
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]); });

predictButton.addEventListener('click', async () => {
  if (!selectedImage) return;
  predictButton.disabled = true;
  predictButton.textContent = 'Analyzing image…';
  results.classList.add('hidden');
  message.textContent = 'Connecting to the VehDetect analysis server…';
  const data = new FormData();
  data.append('image', selectedImage);
  try {
    const response = await fetch(API_URL, { method: 'POST', body: data });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || payload.message || 'Server error');
    const scores = extractScores(payload);
    if (scores) {
      displayResults(scores);
      message.textContent = 'Analysis complete.';
    } else {
      // Current Flask endpoint confirms upload only. It does not predict damage yet.
      resultList.replaceChildren();
      const note = document.createElement('p');
      note.className = 'result-note';
      note.textContent = `${payload.message || 'Image received.'} The trained AI model is not connected yet, so no damage scores are available.`;
      resultList.appendChild(note);
      resultTag.textContent = 'UPLOAD VERIFIED';
      results.classList.remove('hidden');
      message.textContent = 'Upload verified. Model integration is the next step.';
    }
  } catch (error) {
    message.textContent = `Could not complete inspection: ${error.message}. Make sure the Flask backend is running.`;
  } finally {
    predictButton.disabled = !selectedImage;
    predictButton.textContent = 'Predict damage ↗';
  }
});

function extractScores(payload) {
  // Supports a future API returning scores: [six numbers], or predictions: [{name, confidence}].
  if (Array.isArray(payload.scores) && payload.scores.length === 6 && payload.scores.every(Number.isFinite)) return payload.scores;
  if (Array.isArray(payload.predictions)) {
    const normalized = payload.predictions.map(p => ({name: String(p.name ?? p.class ?? p.label ?? '').toLowerCase(), confidence: Number(p.confidence ?? p.probability ?? p.score)}));
    if (damageClasses.every(c => normalized.some(p => p.name === c.toLowerCase() && Number.isFinite(p.confidence)))) {
      return damageClasses.map(c => normalized.find(p => p.name === c.toLowerCase()).confidence);
    }
  }
  return null;
}

function displayResults(scores) {
  resultList.replaceChildren();
  resultTag.textContent = 'AI ANALYSIS';
  const detected = scores.map((confidence, index) => ({name: damageClasses[index], confidence, threshold: thresholds[index]}))
    .filter(item => item.confidence >= item.threshold).sort((a,b) => b.confidence - a.confidence);
  if (!detected.length) {
    const empty = document.createElement('div'); empty.className = 'no-damage';
    const heading = document.createElement('h4'); heading.textContent = 'No category exceeded its threshold';
    const detail = document.createElement('p'); detail.textContent = 'This does not guarantee that the vehicle is undamaged.';
    empty.append(heading, detail); resultList.appendChild(empty);
  }
  detected.forEach(item => {
    const percentage = Math.round(item.confidence * 100);
    const wrap = document.createElement('div'); wrap.className = 'result-item';
    const label = document.createElement('div'); label.className = 'result-label';
    const name = document.createElement('span'); name.textContent = item.name;
    const value = document.createElement('strong'); value.textContent = `${percentage}%`;
    label.append(name, value);
    const track = document.createElement('div'); track.className = 'progress-track';
    const fill = document.createElement('div'); fill.className = 'progress-fill'; fill.style.width = `${percentage}%`;
    track.appendChild(fill); wrap.append(label, track); resultList.appendChild(wrap);
  });
  const note = document.createElement('p'); note.className = 'result-note';
  note.textContent = 'AI predictions are estimates and do not replace a professional vehicle inspection.';
  resultList.appendChild(note);
  results.classList.remove('hidden');
}
