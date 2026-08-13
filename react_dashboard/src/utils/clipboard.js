// Utility copy text to clipboard, hoạt động trên mọi context (HTTPS, localhost, HTTP LAN IP)
// Fallback xuống document.execCommand('copy') khi navigator.clipboard không khả dụng
// (HTTP qua IP LAN không phải secure context nên navigator.clipboard.writeText undefined)

export async function copyToClipboard(text) {
  if (text === null || text === undefined) {
    return false;
  }

  const stringValue = String(text);

  // 1) Modern Clipboard API (HTTPS hoac localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(stringValue);
      return true;
    } catch (e) {
      console.warn('[clipboard] modern API failed, falling back to execCommand', e);
    }
  }

  // 2) Fallback: textarea + execCommand (hoat dong tren HTTP LAN)
  try {
    const ta = document.createElement('textarea');
    ta.value = stringValue;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, stringValue.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('[clipboard] fallback failed', e);
    return false;
  }
}
