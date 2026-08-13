// Utility cho camera/getUserMedia - guard secure context
// Camera API (getUserMedia) chi hoat dong trong secure context (HTTPS hoac localhost)
// Truy cap qua HTTP LAN IP (192.168.x.x) se bi browser chan

export async function getCameraStream(constraints = { video: true }) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Trinh duyet khong ho tro camera. Hay dung Chrome/Edge moi.');
  }
  if (!window.isSecureContext) {
    throw new Error('Camera yeu cau HTTPS hoac localhost. Truy cap qua IP LAN se bi browser chan.');
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function listCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput');
}

// Kiem tra co the su dung camera khong
export function isCameraSupported() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.isSecureContext
  );
}
