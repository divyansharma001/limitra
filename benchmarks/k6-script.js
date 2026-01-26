import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    // 1. The Traffic Load (Background Noise)
    traffic: {
      executor: 'constant-vus',
      vus: 30, // 10 per service
      duration: '30s',
      exec: 'runTraffic',
    },
    // 2. The Chaos Monkey (Single execution)
    chaos: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      startTime: '10s', // Wait 10s then kill
      exec: 'triggerChaos',
    },
  },
  thresholds: {
    // We expect Limitra to stay fast even after chaos
    'http_req_duration{my_tag:limitra}': ['p(95)<100'],
  },
};

// The main loop hitting all 3 services
export function runTraffic() {
  // Hit Limitra
  check(http.get('http://localhost:3001/', { tags: { my_tag: 'limitra' } }), {
    'limitra ok': (r) => r.status === 200 || r.status === 429,
  });

  // Hit ERL
  check(http.get('http://localhost:3002/', { tags: { my_tag: 'erl' } }), {
    'erl ok': (r) => r.status === 200 || r.status === 429,
  });

  // Hit RLF
  check(http.get('http://localhost:3003/', { tags: { my_tag: 'rlf' } }), {
    'rlf ok': (r) => r.status === 200 || r.status === 429,
  });
  
  sleep(0.1); // Small sleep to prevent total network saturation
}

// The Assassin
export function triggerChaos() {
  console.log("🔥 TRIGGERING REDIS OUTAGE...");
  // We only need to hit ONE of them to kill the shared Redis (if they share logic)
  // But our server code kills the *client* instance. 
  // Since we have 3 separate containers, we need to kill Redis in ALL 3 containers.
  
  http.post('http://localhost:3001/simulate-outage');
  http.post('http://localhost:3002/simulate-outage');
  http.post('http://localhost:3003/simulate-outage');
}