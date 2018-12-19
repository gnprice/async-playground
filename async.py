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


demos = {}

def label(l):
    def decorate(f):
        demos[l] = f
        return f
    return decorate


@label('task-stall')
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


@label('task-yield')
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


@label('task-noeager')
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


async def run(label, demo):
    await demo()
    print(f'{label}: {consume()}')


async def main():
    for label, demo in demos.items():
        await run(label, demo)

asyncio.run(main())

