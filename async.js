#!/usr/bin/node

function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

const lines = [];

function log(msg) {
  // Possibly console.log isn't synchronous?
  // To avoid that possible confounder, just push to a list.
  lines.push(msg);
}

let flag = true;
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

// output:
// sometimes a b in! c d in!
async function demo3() {
  say('a');
  say('b');
  await sleep(0);  // Now with 0 wait.
  say('c');
  say('d');
}

// output:
// sometimes a b in! c in! d
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

async function main() {
  freq();

  log('--');
  await demo1();
  log('--');
  await demo2();
  log('--');
  await demo3();
  log('--');
  await demo4();
  log('--');

  done = true;
  await sleep(100);

  const out = lines.join('\n');
  console.log(out);
}

main();
