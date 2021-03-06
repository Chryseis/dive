import { tap, map, distinctUntilChanged } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { isPlainObject, pick } from 'lodash'

export function _And(...rest: any[]): boolean {
    for (let item of rest) {
        if (!item) return false
    }
    return true
}

export function _Or(...rest: any[]): boolean {
    for (let item of rest) {
        if (!!item) return true
    }
    return false
}


export function _debug(message: string, style = '') {
    const isDEV = process.env.NODE_ENV == 'development'
    return tap(
        nextValue => {
            if (isDEV) {
                style
                    ? console.log(message, style, nextValue)
                    : console.log(message, nextValue)
            }
        },
        error => {
            if (isDEV) {
                console.error(message, error)
            }
        },
        () => {
            if (isDEV) {
                console.log('Observable completed - ', message)
            }
        },
    )
}


export function _shouldUpdate(compare: (previous: any, current: any) => boolean) {
    // notice that we return a function here
    return (source: Observable<any>) => Observable.create((subscriber: any) => {
        const subscription = source.pipe(
            distinctUntilChanged((prev, cur) => !compare(prev, cur)),
        ).subscribe(value => {
                try {
                    subscriber.next(value)
                } catch (err) {
                    subscriber.error(err)
                }
            },
            err => subscriber.error(err),
            () => subscriber.complete(),
        )

        return subscription
    })
}

export function _pickByKey(...args: any[]) {
    return (source: any) => Observable.create((subscriber: any) => {
        const subscription = source.pipe(
            map(value => {
                if (!isPlainObject(value)) {
                    throw new TypeError('pickByKey can only use for Object value')
                }
                return pick(value, ...args)
            }),
        ).subscribe((value: any) => {
                try {
                    subscriber.next(value)
                } catch (err) {
                    subscriber.error(err)
                }
            },
            (err: any) => subscriber.error(err),
            () => subscriber.complete(),
        )

        return subscription
    })
}

