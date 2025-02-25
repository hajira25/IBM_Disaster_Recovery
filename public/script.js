const socket = io();

// Handle progress updates
socket.on('progress', (data) => {
  console.log('Progress event received:', data); // Debug log
  const loader = document.getElementById('loader');
  const progressText = document.getElementById('progress-text');

  if (data.percentage === 100 || data.percentage === -1) {
    loader.style.display = 'none';
    if (data.percentage === -1) {
      alert(data.message);
    } else {
      location.reload(); // Refresh page on success
    }
  } else {
    loader.style.display = 'flex';
    progressText.innerText = `${data.message} (${data.percentage}%)`;
  }
});

// Filter logs
function filterLogs() {
  const filter = document.getElementById('logFilter').value.toLowerCase();
  const logs = document.getElementById('logContainer').getElementsByTagName('p');
  Array.from(logs).forEach(log => {
    const text = log.textContent.toLowerCase();
    log.style.display = text.includes(filter) ? '' : 'none';
  });
}

// Ensure loader is hidden on page load
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loader').style.display = 'none';
  console.log('Page loaded, loader hidden');
});