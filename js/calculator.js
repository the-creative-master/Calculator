/*!
 * Calculator engine: pure logic, no DOM.
 * In the browser it's exposed as `window.CalcEngine`; in Node it's `module.exports` (for the tests).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalcEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Most digits you can type into one number. */
  const MAX_DIGITS = 15;
  /** Significant digits kept in results (hides floating-point noise like 0.30000000000000004). */
  const PRECISION = 15;
  const OPERATORS = ['+', '-', '*', '/'];
  const SYMBOL = { '+': '+', '-': '\u2212', '*': '\u00D7', '/': '\u00F7' };
  const ERRORS = {
    DIVIDE_BY_ZERO: "Can't divide by 0",
    OVERFLOW: 'Number too large',
  };

  class CalcError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CalcError';
    }
  }

  const numToken = (value) => ({ type: 'num', value });
  const opToken = (value) => ({ type: 'op', value });
  const isNum = (token) => Boolean(token) && token.type === 'num';
  const isOp = (token) => Boolean(token) && token.type === 'op';
  const isSignOnly = (token) => isNum(token) && token.value === '-';
  const isExponent = (raw) => /e/i.test(raw);

  /** Round off binary floating-point noise (0.1 + 0.2 = 0.3) and drop negative zero. */
  function tidy(n) {
    if (!Number.isFinite(n)) return n;
    const rounded = Number.parseFloat(n.toPrecision(PRECISION));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  /** The raw (unformatted) string we store for a computed number, e.g. "1234.5" or "1e+21". */
  const toRaw = (n) => String(tidy(n));

  const digitCount = (raw) => (raw.match(/\d/g) || []).length;

  /** "5." → "5", so committed numbers never end in a dangling decimal point. */
  const normalizeEntry = (raw) => (raw.endsWith('.') ? raw.slice(0, -1) : raw);

  function negateRaw(raw) {
    return raw.startsWith('-') ? raw.slice(1) : '-' + raw;
  }

  /** Display formatting: thousands separators, a real minus sign, exponent notation kept short. */
  function formatNumber(raw) {
    let s = String(raw);
    let suffix = '';
    if (s.endsWith('%')) {
      suffix = '%';
      s = s.slice(0, -1);
    }
    let sign = '';
    if (s.startsWith('-')) {
      sign = SYMBOL['-'];
      s = s.slice(1);
    }
    if (isExponent(s)) {
      const [mantissa, exponent] = s.toLowerCase().split('e');
      const exp = Number(exponent);
      return `${sign}${mantissa}e${exp < 0 ? SYMBOL['-'] : '+'}${Math.abs(exp)}${suffix}`;
    }
    const dot = s.indexOf('.');
    const integer = dot === -1 ? s : s.slice(0, dot);
    const fraction = dot === -1 ? '' : s.slice(dot);
    return sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + fraction + suffix;
  }

  function formatTokens(tokens) {
    return tokens.map((t) => (isOp(t) ? SYMBOL[t.value] : formatNumber(t.value))).join(' ');
  }

  /** Evaluate parallel value/operator arrays, doing × and ÷ before + and −. */
  function applyPrecedence(values, ops) {
    const terms = [values[0]];
    const addOps = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const value = values[i + 1];
      const last = terms.length - 1;
      if (op === '*') {
        terms[last] *= value;
      } else if (op === '/') {
        if (value === 0) throw new CalcError(ERRORS.DIVIDE_BY_ZERO);
        terms[last] /= value;
      } else {
        addOps.push(op);
        terms.push(value);
      }
    }
    let total = terms[0];
    for (let i = 0; i < addOps.length; i++) {
      total = addOps[i] === '+' ? total + terms[i + 1] : total - terms[i + 1];
    }
    return total;
  }

  /**
   * Evaluate a complete token list (num op num … num).
   * Percent works the way phone calculators do:
   *   a + b%  →  a + (a × b / 100)        a − b%  →  a − (a × b / 100)
   *   a × b%  →  a × (b / 100)            b%      →  b / 100
   */
  function evaluateTokens(tokens) {
    const values = [];
    const ops = [];
    for (const token of tokens) {
      if (isOp(token)) {
        ops.push(token.value);
        continue;
      }
      let raw = token.value;
      const percent = raw.endsWith('%');
      if (percent) raw = raw.slice(0, -1);
      let value = Number.parseFloat(raw);
      if (Number.isNaN(value)) value = 0;
      if (percent) {
        const prevOp = ops[ops.length - 1];
        if (values.length && (prevOp === '+' || prevOp === '-')) {
          const base = applyPrecedence(values, ops.slice(0, -1));
          value = (base * value) / 100;
        } else {
          value /= 100;
        }
      }
      values.push(value);
    }
    return {
      value: applyPrecedence(values, ops),
      lastOp: ops.length ? ops[ops.length - 1] : null,
      lastOperand: values[values.length - 1],
    };
  }

  class Calculator {
    constructor() {
      this.clear();
    }

    /* ------------------------------ state ------------------------------ */

    clear() {
      /** Alternating number / operator tokens. Right after "=", it holds just the result. */
      this.tokens = [];
      /** True right after "=". Digits then start a new sum; operators keep going from the result. */
      this.evaluated = false;
      /** The sum that was just worked out, e.g. "2 + 3 × 4 =". */
      this.history = '';
      /** An error message, or null. */
      this.error = null;
      /** The last operation, so pressing "=" again repeats it. */
      this.repeat = null;
      return true;
    }

    get last() {
      return this.tokens[this.tokens.length - 1];
    }

    /**
     * The number you're typing right now (raw text), or null. A result you didn't type
     * yourself doesn't count. TubeVault uses this to check for "25".
     */
    get entry() {
      if (this.evaluated || this.error) return null;
      return isNum(this.last) ? this.last.value : null;
    }

    /** The big line on the display. */
    get expression() {
      if (this.error) return this.error;
      if (!this.tokens.length) return '0';
      return formatTokens(this.tokens);
    }

    /** A live result while you type (e.g. "14" for "2 + 3 × 4"). Empty when there's nothing to show. */
    get preview() {
      if (this.error || this.evaluated) return '';
      const tokens = this.completeTokens();
      const hasOperator = tokens.some(isOp);
      const hasPercent = tokens.some((t) => isNum(t) && t.value.endsWith('%'));
      if (!hasOperator && !hasPercent) return '';
      try {
        const value = tidy(evaluateTokens(tokens).value);
        return Number.isFinite(value) ? formatNumber(toRaw(value)) : '';
      } catch (error) {
        if (error instanceof CalcError) return '';
        throw error;
      }
    }

    /** A copy of the tokens with any trailing operator or lone minus sign dropped. */
    completeTokens() {
      const tokens = this.tokens.map((t) => ({ ...t }));
      while (tokens.length && (isOp(tokens[tokens.length - 1]) || isSignOnly(tokens[tokens.length - 1]))) {
        tokens.pop();
      }
      for (const t of tokens) if (isNum(t)) t.value = normalizeEntry(t.value);
      return tokens;
    }

    /* ------------------------------ input ------------------------------ */

    inputDigit(digit) {
      const d = String(digit);
      if (!/^\d$/.test(d)) return false;
      this.recoverFromError();
      this.startFreshIfEvaluated();
      const last = this.last;
      if (!isNum(last)) {
        this.tokens.push(numToken(d));
        return true;
      }
      const v = last.value;
      if (v.endsWith('%') || isExponent(v) || digitCount(v) >= MAX_DIGITS) return false;
      if (v === '0') last.value = d;
      else if (v === '-0') last.value = '-' + d;
      else last.value = v + d;
      return true;
    }

    inputDecimal() {
      this.recoverFromError();
      this.startFreshIfEvaluated();
      const last = this.last;
      if (!isNum(last)) {
        this.tokens.push(numToken('0.'));
        return true;
      }
      const v = last.value;
      if (v.includes('.') || v.endsWith('%') || isExponent(v)) return false;
      last.value = v === '-' ? '-0.' : v + '.';
      return true;
    }

    inputOperator(op) {
      if (!OPERATORS.includes(op)) return false;
      this.recoverFromError();
      if (this.evaluated) {
        // Keep going from the result: "= 14" then "+" gives "14 +".
        this.evaluated = false;
        this.history = '';
      }
      const last = this.last;

      if (!last) {
        if (op === '-') this.tokens.push(numToken('-')); // a negative first number
        else this.tokens.push(numToken('0'), opToken(op));
        return true;
      }

      if (isSignOnly(last)) {
        if (op === '-') return false;
        this.tokens.pop(); // swap the lone minus for the new operator
        const prev = this.last;
        if (isOp(prev)) prev.value = op;
        else this.tokens.push(numToken('0'), opToken(op));
        return true;
      }

      if (isNum(last)) {
        last.value = normalizeEntry(last.value);
        this.tokens.push(opToken(op));
        return true;
      }

      // The last token is an operator.
      if (op === '-' && (last.value === '*' || last.value === '/')) {
        this.tokens.push(numToken('-')); // allows 6 × −2
        return true;
      }
      last.value = op; // change your mind: "2 +" then "×" gives "2 ×"
      return true;
    }

    toggleSign() {
      if (this.error) return false;
      const last = this.last;
      if (this.evaluated) {
        if (!isNum(last)) return false;
        last.value = negateRaw(last.value);
        this.history = '';
        this.repeat = null;
        return true;
      }
      if (isSignOnly(last)) {
        this.tokens.pop();
        return true;
      }
      if (isNum(last)) {
        last.value = negateRaw(last.value);
        return true;
      }
      this.tokens.push(numToken('-')); // empty, or just after an operator
      return true;
    }

    percent() {
      if (this.error) return false;
      const last = this.last;
      if (!isNum(last)) return false;
      if (this.evaluated) {
        last.value = toRaw(Number.parseFloat(last.value) / 100);
        this.history = '';
        this.repeat = null;
        return true;
      }
      if (isSignOnly(last) || last.value.endsWith('%')) return false;
      last.value = normalizeEntry(last.value) + '%';
      return true;
    }

    backspace() {
      if (this.recoverFromError()) return true;
      if (this.evaluated) return this.clear();
      const last = this.last;
      if (!last) return false;
      if (isOp(last) || isExponent(last.value)) {
        this.tokens.pop();
        return true;
      }
      const shorter = last.value.slice(0, -1);
      if (shorter === '') this.tokens.pop();
      else last.value = shorter;
      return true;
    }

    equals() {
      if (this.recoverFromError()) return true;
      if (this.evaluated) {
        if (!this.repeat || !isNum(this.last)) return false;
        const { op, operand } = this.repeat;
        return this.finish([numToken(this.last.value), opToken(op), numToken(toRaw(operand))]);
      }
      const tokens = this.completeTokens();
      if (!tokens.length) return false;
      return this.finish(tokens);
    }

    /* ----------------------------- helpers ----------------------------- */

    finish(tokens) {
      const expression = formatTokens(tokens) + ' =';
      let result;
      try {
        result = evaluateTokens(tokens);
      } catch (error) {
        if (!(error instanceof CalcError)) throw error;
        this.fail(expression, error.message);
        return true;
      }
      const value = tidy(result.value);
      if (!Number.isFinite(value)) {
        this.fail(expression, ERRORS.OVERFLOW);
        return true;
      }
      this.history = expression;
      this.tokens = [numToken(toRaw(value))];
      this.evaluated = true;
      this.repeat = result.lastOp ? { op: result.lastOp, operand: tidy(result.lastOperand) } : null;
      return true;
    }

    fail(expression, message) {
      this.tokens = [];
      this.evaluated = false;
      this.repeat = null;
      this.history = expression;
      this.error = message;
    }

    /** After an error, the next key starts over. */
    recoverFromError() {
      if (!this.error) return false;
      this.clear();
      return true;
    }

    startFreshIfEvaluated() {
      if (!this.evaluated) return;
      this.tokens = [];
      this.evaluated = false;
      this.history = '';
      this.repeat = null;
    }
  }

  return { Calculator, formatNumber, evaluateTokens, tidy, SYMBOL, ERRORS, MAX_DIGITS };
});
