#!/usr/bin/node

function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}

let flag = true;
let done = false;

async function freq() {
  while (true) {
    if (flag) {
      flag = false;
      console.log('in!');
    }
    if (done) {
      break;
    }
    await sleep(0);
  }
}

function say(msg) {
  console.log(msg);
  flag = true;
}

// output: a b in! c
async function demo1() {
  say('a');
  say('b');
  await sleep(100);
  say('c');
}

// output: a b in! c
async function demo2() {
  say('a');
  await demo2bc();  // Refactored into a new function.
}

async function demo2bc() {
  say('b');
  await sleep(100);
  say('c');
}

async function main() {
  freq();
  console.log('--');
  await demo1();
  console.log('--');
  await demo2();
  console.log('--');
  done = true;
}

main();
