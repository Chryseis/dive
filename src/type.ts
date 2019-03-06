import { Observable, Subject } from 'rxjs'
import { ReactElement } from 'react'

export type State = {
    [key: string]: any
}

export type Props = {
    [key: string]: any
}

export type Sources = {
    state: State,
    globalState: string[],
    globalEvent: string[]
}

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type EventHandle = {
    event: (eventName: string) => Subject<any>,
    handle: (eventName: string) => (...args: any[]) => void
    didMount: Subject<any>
}

export type GlobalEvent = Omit<EventHandle, 'didMount'>

export type StreamSources = {
    state$: Observable<State>,
    props$: Subject<Props>,
    eventHandle: EventHandle
}

export type Sinks = {
    DOM: Observable<ReactElement<any>>,
    reducer?: Observable<Reducer>
}

export type ComponentFromStream = (streamSources: StreamSources) => Sinks

export type Reducer = ReducerFn | State

export type ReducerFn = (state: State) => State

export enum HttpStatus {
    FRESH = 'fresh',
    PENDING = 'pending',
    FULFILLED = 'fulfilled'
}
