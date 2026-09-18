/** The whole API: route modules register themselves on import; `handle` serves them. */
import './auth'
import './farms'
import './events'
import './photos'
import './invites'

export { handle } from './handle'
