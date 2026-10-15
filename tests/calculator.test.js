'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Calculator, formatNumber, MAX_DIGITS } = require('../js/calculator.js');

/**
 * Presses keys on a calculator. Keys: 0-9 . + - * / = C (clear) < (backspace) n (±) % (percent)
 */
function type(keys, calc = new Calculator()) {
  for (const key of keys) {
    if (/\d/.test(key)) calc.inputDigit(key);
    else if (key === '.') calc.inputDecimal();
    else if ('+-*/'.includes(key)) calc.inputOperator(key);
    else if (key === '=') calc.equals();
    else if (key === 'C') calc.clear();
    else if (key === '<') calc.backspace();
    else if (key === 'n') calc.toggleSign();
    else if (key === '%') calc.percent();
    else throw new Error(`Unknown key ${key}`);
  }
  return calc;
}

test('starts at 0', () => {
  const calc = new Calculator();
  assert.equal(calc.expression, '0');
  assert.equal(calc.history, '');
  assert.equal(calc.preview, '');
});

test('basic arithmetic', () => {
  assert.equal(type('12+7=').expression, '19');
  assert.equal(type('12-20=').expression, '\u22128');
  assert.equal(type('6*7=').expression, '42');
  assert.equal(type('10/4=').expression, '2.5');
});

test('× and ÷ happen before + and −', () => {
  const calc = type('2+3*4=');
  assert.equal(calc.expression, '14');
  assert.equal(calc.history, '2 + 3 \u00D7 4 =');
  assert.equal(type('20-10/5*3=').expression, '14');
});

test('hides floating point noise', () => {
  assert.equal(type('0.1+0.2=').expression, '0.3');
  assert.equal(type('1.1*1.1=').expression, '1.21');
  assert.equal(type('1/3*3=').expression, '1');
});

test('formats with thousands separators while typing and in results', () => {
  assert.equal(type('1234567').expression, '1,234,567');
  assert.equal(type('1234.50').expression, '1,234.50');
  assert.equal(type('999999*1000=').expression, '999,999,000');
});

test('shows a live preview while typing', () => {
  assert.equal(type('2+3*4').preview, '14');
  assert.equal(type('2+').preview, '');
  assert.equal(type('25').preview, '');
  assert.equal(type('50%').preview, '0.5');
  assert.equal(type('2+3*4=').preview, '');
});

test('dividing by zero shows an error, and the next key starts over', () => {
  const calc = type('5/0=');
  assert.equal(calc.error, "Can't divide by 0");
  assert.equal(calc.expression, "Can't divide by 0");
  assert.equal(calc.history, '5 \u00F7 0 =');
  type('7', calc);
  assert.equal(calc.error, null);
  assert.equal(calc.expression, '7');
});

test('very large results show an overflow error', () => {
  const calc = type('999999999999999*999999999999999=');
  for (let i = 0; i < 30 && !calc.error; i++) type('*999999999999999=', calc);
  assert.equal(calc.error, 'Number too large');
});

test('after "=", digits start a new sum and operators keep going', () => {
  assert.equal(type('2+3=4').expression, '4');
  assert.equal(type('2+3=+1=').expression, '6');
  assert.equal(type('2+3=*2=').expression, '10');
});

test('pressing "=" again repeats the last operation', () => {
  const calc = type('2+3===');
  assert.equal(calc.expression, '11');
  assert.equal(calc.history, '8 + 3 =');
  assert.equal(type('2*3==').expression, '18');
});

test('changing your mind about an operator replaces it', () => {
  assert.equal(type('2+*3=').expression, '6');
  assert.equal(type('2*+3=').expression, '5');
});

test('a minus after × or ÷ makes the next number negative', () => {
  assert.equal(type('6*-2=').expression, '\u221212');
  assert.equal(type('6/-2=').expression, '\u22123');
  assert.equal(type('6*-+2=').expression, '8');
});

test('starting with an operator', () => {
  assert.equal(type('+5=').expression, '5');
  assert.equal(type('-5+3=').expression, '\u22122');
});

test('± flips the sign', () => {
  assert.equal(type('5n').expression, '\u22125');
  assert.equal(type('5nn').expression, '5');
  assert.equal(type('n5').expression, '\u22125');
  assert.equal(type('3+n2=').expression, '1');
  assert.equal(type('2+3=n').expression, '\u22125');
});

test('percent works like a phone calculator', () => {
  assert.equal(type('200+10%=').expression, '220');
  assert.equal(type('200-10%=').expression, '180');
  assert.equal(type('50*10%=').expression, '5');
  assert.equal(type('50%=').expression, '0.5');
  assert.equal(type('2+3=%').expression, '0.05');
});

test('decimal point', () => {
  assert.equal(type('.5').expression, '0.5');
  assert.equal(type('1.5.2').expression, '1.52');
  assert.equal(type('5.+1=').expression, '6');
  assert.equal(type('2+3=.5').expression, '0.5');
});

test('backspace', () => {
  assert.equal(type('123<').expression, '12');
  assert.equal(type('12+<').expression, '12');
  assert.equal(type('1<').expression, '0');
  assert.equal(type('2+3=<').expression, '0');
});

test(`stops at ${MAX_DIGITS} digits`, () => {
  const calc = type('12345678901234567890');
  assert.equal(calc.entry, '123456789012345');
});

test('leading zeros are replaced', () => {
  assert.equal(type('007').expression, '7');
  assert.equal(type('n07').expression, '\u22127');
});

test('clear resets everything', () => {
  const calc = type('2+3=C');
  assert.equal(calc.expression, '0');
  assert.equal(calc.history, '');
  assert.equal(calc.entry, null);
});

test('entry is the number being typed (used for the FreeTube "25" check)', () => {
  assert.equal(type('25').entry, '25');
  assert.equal(type('3+25').entry, '25');
  assert.equal(type('125').entry, '125');
  assert.equal(type('25+').entry, null);
  assert.equal(type('5*5=').entry, null, 'a result you did not type does not count');
  assert.equal(type('025').entry, '25');
  assert.equal(type('2.5').entry, '2.5');
});

test('formatNumber', () => {
  assert.equal(formatNumber('-1234.50'), '\u22121,234.50');
  assert.equal(formatNumber('1e+21'), '1e+21');
  assert.equal(formatNumber('1.5e-7'), '1.5e\u22127');
  assert.equal(formatNumber('12%'), '12%');
  assert.equal(formatNumber('0.'), '0.');
});
