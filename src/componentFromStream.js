import React, {Component, useEffect, useMemo, useState} from 'react'
import {createChangeEmitter} from 'change-emitter'
import {from, Subject, Observable, EMPTY, of, BehaviorSubject, merge} from 'rxjs'
import {
  debounce,
  distinctUntilChanged,
  scan,
  share,
  shareReplay,
  skip,
  switchMap, takeWhile,
  tap,
  withLatestFrom,
} from 'rxjs/operators'
import shallowEqual from './shallowEqual'
import {drivers, oldMap} from './applyDriver'
import {cloneDeep, isEqual, once, uniqueId} from 'lodash'
import subState$ from './subState'
import {actions$} from './globalState'

function getReducer(ownReducer, id) {
  if (ownReducer == null) return
  let reducer = ownReducer
  if (typeof ownReducer !== 'function') {
    reducer = state => {
      const nextState = Object.assign({}, state, ownReducer)
      actions$.next({ id, state, nextState })
      return nextState
    }
  } else {
    reducer = state => {
      const nextState = ownReducer(state)
      if (state == nextState) {
        actions$.next({ id, unChanged: true })
      } else {
        actions$.next({ state, nextState, id })
      }
      return nextState
    }
  }
  return reducer
}

export const componentFromStream = ({ myId, state$, updateGlobal, initState, update, streamsToVdom, type }) => {
  return class ComponentFromStream extends Component {
    constructor() {
      super()
      this.driversSubscription = []
      this.transfer = {}
      this.myId = myId
      this.state$ = state$
      this.update = update
      this.updateGlobal = updateGlobal
      this.state = { vdom: null }
      this.eventMap = {}
      this.active = true

      this.propsEmitter = createChangeEmitter()


      this.props$ = Observable.create(observer => {
        this.propsEmitter.listen(props => {
          if (props) {
            observer.next(props)
          } else {
            observer.complete()
          }
        })
      })

      // 没有lens的组件，不与global连接，自己维护状态
      if (type == 'empty-lens') {
        this.myId = uniqueId('dive-isolate')
        this.state$ = new BehaviorSubject(_ => initState).pipe(
            scan((state, reducer) => reducer(state), {}),
            distinctUntilChanged(),
        )
        this.update = (ownReducer) => {
          let reducer = getReducer(ownReducer, this.myId)
          this.state$.next(reducer)
        }
      } else if (type == 'only-get-lens') {
        this.myId = uniqueId('dive-isolate')
        const transfer$ = new BehaviorSubject(initState)
        const globalState$ = state$(transfer$).pipe(
            distinctUntilChanged(shallowEqual),
        )
        const ownState$ = new Subject().pipe(
            scan((state, reducer) => reducer(state), initState),
            withLatestFrom(globalState$, (ownState, state) => {
              return Object.assign({}, state, ownState)
            }),
            distinctUntilChanged(shallowEqual),
            tap(state => transfer$.next(state)),
        )
        this.update = (ownReducer) => {
          let reducer = getReducer(ownReducer, this.myId)
          ownState$.next(reducer)
        }
        this.state$ = merge(globalState$, ownState$).pipe(
            distinctUntilChanged(isEqual),
        )
      } else if (type == 'only-set-lens') {
        this.myId = uniqueId('dive-isolate')
        this.state$ = new BehaviorSubject(_ => initState).pipe(
            scan((state, reducer) => reducer(state), {}),
            distinctUntilChanged(),
            tap(this.updateGlobal),
        )
        this.update = (ownReducer) => {
          let reducer = getReducer(ownReducer, this.myId)
          this.state$.next(reducer)
        }
      }
      this.state$ = this.state$.pipe(
          takeWhile(() => this.active),
          shareReplay(1),
      )
      this.state$.update = (reducer$) => {
        this.reducerSubscription = reducer$
            .subscribe(reducer => this.update(reducer))
      }
      this.state$.subscribe(state => subState$.next({ [this.myId]: state }))
      // Stream of vdom
      this.vdom$ = streamsToVdom({
        props$: this.props$.pipe(distinctUntilChanged(shallowEqual)),
        state$: this.state$,
        eventHandle: {
          event: (eventName) => {
            this.eventMap[eventName] = this.eventMap[eventName] || new Subject()
            return this.eventMap[eventName]
          },
          handle: (eventName) => {
            return (...args) => this.eventMap[eventName].next(args.length > 1 ? args : args[0])
          },
        },
        ...drivers,
      })
      Object.keys(drivers).forEach(key => {
        this.transfer[key] = new Subject()
        drivers[key].update = (obs) => {
          this.driversSubscription.push(
              obs.subscribe(this.transfer[key]),
          )
          oldMap[key](this.transfer[key])
          drivers[key].update = oldMap[key]
        }
      })

    }

    componentDidMount() {
      this.vdomSubscription = this.vdom$.subscribe({
        next: vdom => {
          this.setState({ vdom })
        },
      })
      // Subscribe to child prop changes so we know when to re-render
      this.propsEmitter.emit(this.props)
    }

    componentWillReceiveProps(nextProps) {
      // Receive new props from the owner
      this.propsEmitter.emit(nextProps)
    }

    shouldComponentUpdate(nextProps, nextState) {
      return nextState.vdom !== this.state.vdom
    }

    componentWillUnmount() {
      this.active = false
      // Call without arguments to complete stream
      this.propsEmitter.emit()
      // Clean-up subscription before un-mounting
      this.vdomSubscription.unsubscribe()
      // console.log('unount', myId)
      this.reducerSubscription && this.reducerSubscription.unsubscribe()
      this.driversSubscription.forEach(sub => sub.unsubscribe())
    }

    render() {
      return this.state.vdom
    }
  }
}


