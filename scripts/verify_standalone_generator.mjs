// Verification script: generate HTML + ESP code with a sample config and
// check that the requested fixes are in place.
//
// Use .mjs extension so Node treats it as ES module without needing
// "type": "module" in package.json (which would break the React build).

import { generateStandaloneHTML } from '../react_dashboard/src/utils/standaloneHtmlGenerator.js';
import { generateStandaloneESP8266 } from '../react_dashboard/src/utils/standaloneESPGenerator.js';

const controls = [
  {
    id: 'w_1712345678_42',
    type: 'joystick_full',
    label: 'Joystick Full',
    icon: '🕹️',
    x: 0, y: 0, width: 4, height: 4,
    virtualPin: 0, gpio: [],
    min: 0, max: 255, step: 1,
    orientation: 'both',
    value: 0,
  },
  {
    id: 'w_1712345679_99',
    type: 'button',
    label: 'Button ON/OFF',
    icon: '🔘',
    x: 4, y: 0, width: 2, height: 2,
    virtualPin: 17, gpio: [],
    onValue: 1, offValue: 0,
    invert: false,
  },
  {
    id: 'w_special-label_123',
    type: 'toggle',
    label: '<Toggle & "Test">',
    icon: '⚡',
    x: 0, y: 4, width: 2, height: 2,
    virtualPin: 18, gpio: [],
    onValue: 1, offValue: 0,
  },
  {
    id: 'w_slider_456',
    type: 'slider',
    label: 'Brightness',
    icon: '🔆',
    x: 6, y: 0, width: 4, height: 2,
    virtualPin: 19, gpio: [],
    min: 0, max: 255, step: 1,
  },
];

const html = generateStandaloneHTML(controls, {
  ssid: 'MyWiFi',
  devicePreset: 'iphone-12',
  customWidth: 390,
  customHeight: 844,
  orientation: 'portrait',
  serverPort: 80,
  serverEndpoint: 'control',
});

const esp = generateStandaloneESP8266(controls, html, {
  ssid: 'MyWiFi',
  password: 'password123',
  serverPort: 80,
  serverEndpoint: 'control',
  useStaticIp: false,
});

let failed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK    ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

console.log('\n=== HTML checks ===');
check('HTML no function toggleButton(<number>) JS syntax error',
  !/function toggleButton\([0-9]/.test(html));
check('HTML uses function toggleButton(stateId)',
  /function toggleButton\(stateId\)/.test(html));
check('HTML safeId-based endpoint /joystick_full/w_',
  /\/joystick_full\/w_/.test(html));
check('HTML safeId-based endpoint /button/w_',
  /\/button\/w_/.test(html));
check('HTML joystick real-time send from pointermove',
  /pointermove[\s\S]{0,400}?sendJoystick\(\)/.test(html));
check('HTML throttle 50ms in pointermove',
  /now - lastSend > 50/.test(html));
check('HTML escapes label containing < > &',
  !/<Toggle & "Test">/.test(html));
check('HTML escaped label uses &lt; and &amp;',
  /&lt;Toggle &amp;/.test(html));
check('HTML element id uses safeId (no dot)',
  !/id="btn-[0-9]+\./.test(html) && /id="btn-w_/.test(html));
check('HTML addEventListener (no inline onclick)',
  /addEventListener\('click'/.test(html));
check('HTML setupJoystick stateId resolves to safeId',
  /setupJoystick\('w_1712345678_42'\)/.test(html));

console.log('\n=== ESP checks ===');
check('ESP uses /joystick_full/ type in endpoint',
  /server\.on\("\/joystick_full\/w_/.test(esp));
check('ESP uses /button/ type in endpoint',
  /server\.on\("\/button\/w_/.test(esp));
check('ESP no hardcoded IP 192.168.4.x',
  !/IPAddress staticIP\(192, 168, 4, 2\)/.test(esp));
check('ESP defaults to DHCP (no static IP)',
  /DHCP \(no static IP\)/.test(esp));
check('ESP adds analogWriteRange(255) for PWM widgets',
  /analogWriteRange\(255\)/.test(esp));
check('ESP handlers send CORS header',
  /Access-Control-Allow-Origin/.test(esp));
check('ESP validates arg length before toInt()',
  /valArg\.length\(\) == 0/.test(esp) || /stateArg\.length\(\) == 0/.test(esp));
check('ESP escaped label in Serial.print (only " needs \\" in C string)',
  /Serial\.print\("<Toggle & \\"Test\\">:/.test(esp));
check('ESP WiFi init order: persistent -> disconnect -> mode -> begin',
  /WiFi\.persistent\(false\);[\s\S]{0,150}WiFi\.disconnect\(\);[\s\S]{0,150}WiFi\.mode\(WIFI_STA\)/.test(esp));
check('ESP wifiConfigCall omitted when useStaticIp=false',
  !/WiFi\.config\(staticIP, gateway/.test(esp));
check('ESP handler filename compat: 1785311239716.7202 also works',
  true /* below test */);
check('ESP onNotFound has properly escaped JSON string',
  /server\.send\(404, "application\/json", "\{\\"success\\":false,\\"message\\":\\"Endpoint not found\\"\}"\)/.test(esp));
check('HTML joystick uses 0-255 range (no *100)',
  !/\* 100/.test(html) && /\+ 1\) \* 127\.5/.test(html));
check('ESP joystick state initialized with comment about center',
  /int joystickX = 128; \/\/ Center on 0-255 range/.test(esp));

console.log('\n=== ESP8266 PWM init & WiFi reconnect robustness ===');
check('ESP setup initializes PWM for joystick X (avoid floating pins)',
  /analogWrite\(PIN_JOYSTICK_X, joystickX\)/.test(esp));
check('ESP setup initializes PWM for joystick Y',
  /analogWrite\(PIN_JOYSTICK_Y, joystickY\)/.test(esp));
check('ESP setup initializes PWM for slider/knob/number_input (pwmValue=0)',
  /analogWrite\(PIN_PWM, pwmValue\)/.test(esp));
check('ESP WIFI_RETRY_INTERVAL is 30000ms (was 10000)',
  /WIFI_RETRY_INTERVAL = 30000/.test(esp));
check('ESP maxRetry is 20 (was 40, 10s blocking max)',
  /const int maxRetry = 20/.test(esp));
check('ESP no dead variable lastSendTime',
  !/lastSendTime/.test(esp));
check('ESP GPIO15 has internal pull-down warning',
  /PIN_JOYSTICK_Y\s+15\s+\/\/ Joystick Y axis — NOTE: GPIO15 has internal pull-down/.test(esp));

console.log('\n=== Backward compatibility ===');
const oldControls = [
  { id: '1785311239716.7202', type: 'joystick_full', label: 'Old Widget', x: 0, y: 0, width: 4, height: 4, virtualPin: 0, gpio: [] },
];
try {
  const oldHtml = generateStandaloneHTML(oldControls, { ssid: 'X' });
  const oldEsp = generateStandaloneESP8266(oldControls, oldHtml, { ssid: 'X', password: 'X' });
  check('Old numeric-dot id renders without throwing',
    /joystick-full|JOYSTICK_FULL/.test(oldEsp));
  check('Old numeric-dot id sanitized (no dot in HTML endpoint)',
    /\/joystick_full\/1785311239716_7202/.test(oldHtml));
  check('Old id is sanitized on ESP side too',
    /_1785311239716_7202/.test(oldEsp));
} catch (e) {
  console.log('  FAIL  backward compat — threw exception:', e.message);
  failed++;
}

console.log('\n=== useStaticIp=true path ===');
const espStatic = generateStandaloneESP8266(controls, html, {
  ssid: 'X', password: 'X',
  useStaticIp: true,
  staticIp: '192.168.1.200',
  staticGateway: '192.168.1.1',
});
check('ESP emits IPAddress staticIP(192,168,1,200) when useStaticIp=true',
  /IPAddress staticIP\(192, 168, 1, 200\)/.test(espStatic));
check('ESP emits WiFi.config(...) when useStaticIp=true',
  /WiFi\.config\(staticIP, gateway, subnet, dns1, dns2\)/.test(espStatic));

console.log(`\n${failed === 0 ? '✅ ALL PASS' : `❌ FAILED ${failed} check(s)`}`);
process.exit(failed === 0 ? 0 : 1);
