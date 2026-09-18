/** The whole API: route modules register themselves on import; `handle` serves them. */
import './auth'
import './farms'
import './events'
import './photos'

export { handle } from './handle'
