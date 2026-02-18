import http from 'k6/http';
import { check } from 'k6';

// --- Configuration ---

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const ENDPOINT = `${BASE_URL}/api/v1/events`;

export const options = {
  scenarios: {
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 100,             // 100 iterations per timeUnit
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],   // p95 latency under 200ms
    http_req_failed: ['rate<0.01'],     // less than 1% failure rate
  },
};

// --- Payload generation ---

const EVENT_TYPES = ['page_view', 'button_click', 'form_submit'];
const SOURCES = ['web', 'mobile-ios', 'mobile-android'];
const PAGES = ['/home', '/dashboard', '/settings', '/profile', '/checkout'];
const BROWSERS = ['chrome', 'firefox', 'safari', 'edge'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildEvent() {
  const eventType = randomItem(EVENT_TYPES);

  const payload = {
    url: randomItem(PAGES),
    session_id: `sess-${Math.random().toString(36).substring(2, 10)}`,
    duration_ms: Math.floor(Math.random() * 5000),
  };

  // Add type-specific fields
  if (eventType === 'button_click') {
    payload.element_id = `btn-${Math.floor(Math.random() * 20)}`;
  } else if (eventType === 'form_submit') {
    payload.form_name = randomItem(['login', 'signup', 'search', 'feedback']);
    payload.field_count = Math.floor(Math.random() * 10) + 1;
  }

  return {
    event_type: eventType,
    source: randomItem(SOURCES),
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      user_agent: randomItem(BROWSERS),
      ip_hash: Math.random().toString(36).substring(2, 14),
    },
  };
}

// --- Test execution ---

const HEADERS = { 'Content-Type': 'application/json' };

export default function () {
  const res = http.post(ENDPOINT, JSON.stringify(buildEvent()), { headers: HEADERS });

  check(res, {
    'status is 202': (r) => r.status === 202,
    'has event_id': (r) => {
      try { return JSON.parse(r.body).event_id !== undefined; }
      catch { return false; }
    },
  });
}
