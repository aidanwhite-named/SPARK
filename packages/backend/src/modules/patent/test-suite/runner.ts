import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeClaimText } from '../claim.parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestCase {
  id: string;
  description: string;
  input: string;
  expected: string;
}

function runSuite() {
  console.log('==================================================');
  console.log('🚀 청구항 텍스트 파서 회귀 테스트 스위트 시작');
  console.log('==================================================');

  const casesPath = join(__dirname, 'cases.json');
  const cases: TestCase[] = JSON.parse(readFileSync(casesPath, 'utf8'));

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    console.log(`\n• 테스트 케이스: [${tc.id}]`);
    console.log(`  설명: ${tc.description}`);

    const actual = normalizeClaimText(tc.input);

    if (actual === tc.expected) {
      console.log('  ✅ 성공 (통과)');
      passed++;
    } else {
      console.error('  ❌ 실패!');
      console.error('  [입력값]:');
      console.error(tc.input.split('\n').map(l => `    | ${l}`).join('\n'));
      console.error('  [기대하는 결과]:');
      console.error(tc.expected.split('\n').map(l => `    | ${l}`).join('\n'));
      console.error('  [실제 출력된 결과]:');
      console.error(actual.split('\n').map(l => `    | ${l}`).join('\n'));
      failed++;
    }
  }

  console.log('\n==================================================');
  console.log(`📊 테스트 완료: 총 ${cases.length}개 중 성공 ${passed}개, 실패 ${failed}개`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite();
