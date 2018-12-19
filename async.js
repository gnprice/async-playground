#!/usr/bin/node
/**
 * Usage:
 *   for i in {1..40}; do ./async.js; done | sort | uniq -c
 *
 * Demonstrates some of the behavior of JS's cooperative multitasking.
 *
 * Mostly confirmed what I thought I understood, but there was one
 * behavior which surprised me, and I had to think harder but I
 * believe I now understand.  If you take a chunk of an async function
 * and factor it out into a new async function, calling with `await`,
 * there's an asymmetry: no yield point is created at *entry* to the
 * new function, but a yield point *is* created at *exit*.
 *
 * I think with typical patterns this is much less likely to bite you
 * than a yield point at entry, even if totally unaware of this
 * possibility -- but it seems like something to keep in mind.
 *
 * Here's why this happens, AIUI:
 *
 *  * When `await foo()` is evaluated, that starts by evaluating
 *    `foo()`, calling the function; and that enters the function
 *    body and starts running just as if it were a normal function.
 *    There's no yield.
 *
 *  * When the execution of `foo` hits an `await`, it stops, attaches
 *    to that promise a `then` callback with the current continuation,
 *    and then returns a promise of its own result.  The caller which
 *    had `await foo()` then does the same thing to that promise, on
 *    up the chain to the event loop.  IOW, the code yields.
 *
 *  * Eventually the innermost promise resolves, perhaps, and the
 *    event loop comes back to that continuation and takes the
 *    innermost of these async functions farther.  It might get to
 *    another `await` and do the same thing; or at some point it might
 *    `return`, or fall off the end of the function.  (Or throw an
 *    exception, but let's bracket that.)
 *
 *  * Here's the thing: when it does get to a `return`, that just
 *    *resolves the promise*... which does not mean calling the
 *    continuation.  It just means *scheduling* it to be called, by
 *    the event loop.  The actual direct control-flow return, then,
 *    goes straight back to the event loop.  IOW, the code yields again.
 *
 *  * When thinking about the more general Promise API that this
 *    async/await functionality is built on, the yield point at
 *    function exit is kind of inevitable -- because a Promise can
 *    have multiple continuations attached with "then".  Within the
 *    normal `await foo(...)` pattern where the result of the function
 *    call is immediately awaited on, I think you could reasonably
 *    have a semantics where an async function's `return` means
 *    jumping directly to its caller's continuation... but in JS
 *    `await foo(...)` isn't syntax, rather `await EXPR` is.  And if
 *    the caller has gone and attached a whole bunch of continuations
 *    to the promise, it doesn't make sense to "just return" to them.
 *
 * All quoted results below are with:
 *   $ uname -sv; node --version
 *   Linux #1 SMP Debian 4.18.20-2 (2018-11-23)
 *   v8.14.0
 */

function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

const messages = [];

function log(msg) {
  // Possibly console.log isn't synchronous?
  // To avoid that possible confounder, just push to a list.
  messages.push(msg);
}

function consume() {
  const out = messages.join(' ');
  messages.length = 0;
  return out;
}

let flag = false;
let done = false;

async function freq() {
  while (true) {
    if (flag) {
      flag = false;
      log('in!');
    }
    if (done) {
      break;
    }
    await sleep(0);
  }
}

function say(msg) {
  log(msg);
  flag = true;
}

// output: a b in! c d
async function demo1() {
  say('a');
  say('b');
  await sleep(100);
  say('c');
  say('d');
}

// output: a b in! c d
async function demo2() {
  say('a');
  await demo2bc();  // Refactored into a new function.
  say('d');
}

async function demo2bc() {
  say('b');
  await sleep(100);
  say('c');
}

// output: one of, approx. percentages:
//  25%  a b in! c d
//  75%  a b in! c d in!
async function demo3() {
  say('a');
  say('b');
  await sleep(0);  // Now with 0 wait.
  say('c');
  say('d');
}

// output: one of, approx. percentages:
//  60%  a b in! c d
//  40%  a b in! c in! d
//
// Seems highly correlated with demo3; one n=25 sample had the extra
// "in!" for neither in 6, demo3 only in 6, both in 13.
async function demo4() {
  say('a');
  await demo4bc();  // Same refactoring.
  say('d');
}

async function demo4bc() {
  say('b');
  await sleep(0);
  say('c');
}

// $ for i in {1..1000}; do ./async.js; done | sort | uniq -c
// 214 deep1: 3 2 1 0 in! x3 x2 x1 x0 0 in! 1 in! 2 in! 3
//  18 deep1: 3 2 1 0 x3 in! x2 x1 x0 0 in! 1 in! 2 in! 3
//   6 deep1: 3 2 1 0 x3 x2 in! x1 x0 0 in! 1 in! 2 in! 3
//   5 deep1: 3 2 1 0 x3 x2 x1 in! x0 0 in! 1 in! 2 in! 3
// 738 deep1: 3 2 1 0 x3 x2 x1 x0 in! 0 in! 1 in! 2 in! 3
//  19 deep1: 3 2 1 0 x3 x2 x1 x0 in! 0 in! 1 in! 2 in! 3 in!
async function demoDeep1(ttl=3) {
  say(ttl);
  sleep(0).then(() => log(`x${ttl}`));
  if (ttl > 0) {
    await demoDeep1(ttl-1);
  }
  await sleep(0);
  say(ttl);
}

// $ for i in {1..100}; do ./async.js; done | sort | uniq -c
//   7 deep2: 3 2 1 0 in! x0 0 in! x1 1 in! x2 2 x3 in! 3
//  10 deep2: 3 2 1 0 in! x0 0 in! x1 1 x2 in! 2 x3 in! 3
//   4 deep2: 3 2 1 0 x0 in! 0 in! x1 1 in! x2 2 x3 in! 3
//   2 deep2: 3 2 1 0 x0 in! 0 in! x1 1 x2 in! 2 x3 in! 3
//   1 deep2: 3 2 1 0 x0 in! 0 in! x1 1 x2 in! 2 x3 in! 3 in!
//   3 deep2: 3 2 1 0 x0 in! 0 x1 in! 1 x2 in! 2 in! x3 3 in!
//  73 deep2: 3 2 1 0 x0 in! 0 x1 in! 1 x2 in! 2 x3 in! 3
async function demoDeep2(ttl=3) {
  say(ttl);
  if (ttl > 0) {
    await demoDeep2(ttl-1);
  }
  sleep(0).then(() => log(`x${ttl}`));
  await sleep(0);
  say(ttl);
}

// output: b a c
async function demoEager() {
  const p = (async function() {
    log('b');
    return 'c';
  })();
  log('a');
  log(await p);
}

const demos = new Map(Object.entries({
  1: demo1,
  2: demo2,
  3: demo3,
  4: demo4,
  deep1: demoDeep1,
  deep2: demoDeep2,
  eager: demoEager,
}));

async function run(label, demo) {
  flag = true;
  await demo();
  console.log(`${label}: ${consume()}`);
}

async function main() {
  freq();
  for (const label of 'eager 3 deep2'.split(' ')) {
    await run(label, demos.get(label));
  }
  done = true;
}

main();
