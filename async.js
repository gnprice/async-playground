#!/usr/bin/node
// Usage:
//   for i in {1..25}; do ./async.js; done | sort | uniq -c

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

async function run(label, demo) {
  flag = true;
  await demo();
  console.log(`${label}: ${consume()}`);
}

async function main() {
  freq();
  for (const e of [demo1, demo2, demo3, demo4].entries()) {
    await run(e[0]+1, e[1]);
  }
  done = true;
}

main();
