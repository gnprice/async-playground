#!/usr/bin/env python3.7

import asyncio
from asyncio import sleep


messages = []

def log(message):
    messages.append(message)

def consume():
    out = ' '.join(messages)
    messages[:] = []
    return out


flag = False
done = False

async def freq():
    global flag
    while True:
        if flag:
            flag = False
            log('in!')
        if done:
            break
        await sleep(0)

def say(message):
    global flag
    log(str(message))
    flag = True


demos = {}

def label(l, *, interrupt=False):
    def decorate(f):
        demos[l] = f
        f.interrupt = interrupt
        return f
    return decorate


# Results on the "factor out a subroutine" demos:
#
# $ time for i in {1..20}; do ./async.py; done | sort | uniq -c
#  20 1: a b in! c d
#  20 2: a b in! c d
#  20 3: a b in! c d
#  20 4: a b in! c d
#
# All identical!  No evidence of a yield point at entering or exiting
# an async function ^W^W coroutine -- only at the actual sleep() inside.
#
# This and all other quoted results done with:
#   $ uname -sv; python3.7 -V
#   Linux #1 SMP Debian 4.18.20-2 (2018-11-23)
#   Python 3.7.2rc1

@label('1', interrupt=True)
async def demo1():
    say('a')
    say('b')
    await sleep(0.1)
    say('c')
    say('d')


@label('2', interrupt=True)
async def demo2():
    say('a')
    await demo2bc()  # Refactored into a new function.
    say('d')

async def demo2bc():
    say('b')
    await sleep(0.1)
    say('c')


@label('3', interrupt=True)
async def demo3():
    say('a')
    say('b')
    await sleep(0)  # Now with 0 wait.
    say('c')
    say('d')


@label('4', interrupt=True)
async def demo4():
    say('a')
    await demo4bc()  # Same refactoring.
    say('d')

async def demo4bc():
    say('b')
    await sleep(0)
    say('c')


@label('task1')
async def demo_task_stall():
    '''
    Just calling a coroutine doesn't run anything.

    output: a b c
    '''
    async def f():
        log('b')
        return 'c'
    p = f()
    await sleep(0.1)
    log('a')
    await sleep(0.1)
    log(await p)


@label('task2')
async def demo_task_yield():
    '''
    Adding create_task() makes it run, if you yield for it.

    output: b a c
    '''
    async def f():
        log('b')
        return 'c'
    p = asyncio.create_task(f())
    await sleep(0)
    log('a')
    log(await p)


@label('task3')
async def demo_task_noeager():
    '''
    Doesn't run eagerly, though -- only at a yield point.

    output: a b c
    '''
    async def f():
        log('b')
        return 'c'
    p = asyncio.create_task(f())
    log('a')
    log(await p)


@label('deep1-hl', interrupt=True)
async def demo_deep1_hl(ttl=3):
    '''
    If we get a callback onto the loop with sleep(0) -> add_done_callback,
    it doesn't get run until the *third* yield point thereafter.  Huh.

    $ for i in {1..1000}; do ./async.py; done | sort | uniq -c
     1000 deep1-hl: 3 2 1 0 in! 0 in! 1 in! x3 x2 x1 x0 2 in! 3
    '''
    say(ttl)
    asyncio.create_task(sleep(0)).add_done_callback(
        lambda _: log(f'x{ttl}'))
    if ttl > 0:
        await demo_deep1_hl(ttl - 1)
    await sleep(0)
    say(ttl)


@label('deep1-ll', interrupt=True)
async def demo_deep1_ll(ttl=3):
    '''
    If instead of the "high-level API" we use `call_soon` from the
    "low-level API" to schedule directly onto the event loop, the
    callback happens at the next yield point.

    $ for i in {1..200}; do ./async.py; done | sort | uniq -c
     200 deep1-ll: 3 2 1 0 in! x3 x2 x1 x0 0 in! 1 in! 2 in! 3
    '''
    say(ttl)
    asyncio.get_running_loop().call_soon(
        lambda: log(f'x{ttl}'))
    if ttl > 0:
        await demo_deep1_ll(ttl - 1)
    await sleep(0)
    say(ttl)


@label('deep2-h1', interrupt=True)
async def demo_deep2_h1(ttl=4):
    '''
    The fascinating "on the third yield it runs" behavior in the
    "high-level API" continues even when those yields are interspersed
    with the create_task calls.

    $ for i in {1..20}; do ./async.py; done | sort | uniq -c
     20 deep2-h1: 4 3 2 1 0 in! 0 in! 1 in! x0 2 in! x1 3 in! x2 4
    '''
    say(ttl)
    if ttl > 0:
        await demo_deep2_h1(ttl-1)
    asyncio.create_task(sleep(0)).add_done_callback(
        lambda _: log(f'x{ttl}'))
    await sleep(0)
    say(ttl)


@label('deep2-h2', interrupt=True)
async def demo_deep2_h2(ttl=4):
    '''
    If we stick a redundant sleep(0) in, that moves it up...

     20 deep2-h2: 4 3 2 1 0 in! 0 in! x0 1 in! x1 2 in! x2 3 in! x3 4
    '''
    say(ttl)
    if ttl > 0:
        await demo_deep2_h2(ttl-1)
    asyncio.create_task(sleep(0)).add_done_callback(
        lambda _: log(f'x{ttl}'))
    await sleep(0)
    await sleep(0)
    say(ttl)


@label('deep2-h3', interrupt=True)
async def demo_deep2_h3(ttl=4):
    '''
    ... and if we stick a third sleep(0) in, the callback actually runs.

     20 deep2-h3: 4 3 2 1 0 in! x0 0 in! x1 1 in! x2 2 in! x3 3 in! x4 4
    '''
    say(ttl)
    if ttl > 0:
        await demo_deep2_h3(ttl-1)
    asyncio.create_task(sleep(0)).add_done_callback(
        lambda _: log(f'x{ttl}'))
    await sleep(0)
    await sleep(0)
    await sleep(0)
    say(ttl)


@label('deep2-ll', interrupt=True)
async def demo_deep2_ll(ttl=4):
    '''
    As before, `call_soon` behaves in a more expected way in the first place;
    same as we get above if we make three sleep(0) calls.

     20 deep2-ll: 4 3 2 1 0 in! x0 0 in! x1 1 in! x2 2 in! x3 3 in! x4 4
    '''
    say(ttl)
    if ttl > 0:
        await demo_deep2_ll(ttl-1)
    asyncio.get_running_loop().call_soon(
        lambda: log(f'x{ttl}'))
    await sleep(0)
    say(ttl)


async def run(label, demo):
    global flag
    if demo.interrupt:
        flag = True
    await demo()
    print(f'{label}: {consume()}')
    await sleep(0.001)
    consume()


async def main():
    global done
    asyncio.create_task(freq())
    for label in demos.keys():
        await run(label, demos[label])
    done = True

asyncio.run(main())
