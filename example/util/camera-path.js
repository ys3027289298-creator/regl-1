/*
  Smooth camera paths built on the shared spline layer in lib/util/spline.

  A path holds a column of camera states (eye position, look-at center and up
  vector are all sampled with the same spline instance) and returns a state at
  any normalised time t in [0, 1].
 */

var spline = require('../../lib/util/spline')

module.exports = createCameraPath

function createCameraPath (keyframes, options) {
  var settings = options || {}
  var type = settings.type || 'catmull-rom'
  var edge = settings.edge || 'clamp'

  var eyes = keyframes.map(function (frame) {
    return frame.eye
  })
  var centers = keyframes.map(function (frame) {
    return frame.center
  })
  var ups = keyframes.map(function (frame) {
    return frame.up || [0, 1, 0]
  })

  var eyePath = spline.createPath(eyes, {
    type: type,
    edge: edge,
    tension: settings.tension,
    knots: settings.knots
  })
  var centerPath = spline.createPath(centers, {
    type: type,
    edge: edge,
    tension: settings.tension,
    knots: settings.knots
  })
  var upPath = spline.createPath(ups, {
    type: type,
    edge: edge,
    tension: settings.tension,
    knots: settings.knots
  })

  function stateAt (t) {
    return {
      eye: eyePath.at(t),
      center: centerPath.at(t),
      up: upPath.at(t)
    }
  }

  return {
    at: stateAt,
    eye: eyePath,
    center: centerPath,
    up: upPath,
    count: keyframes.length,
    type: type,
    edge: edge
  }
}
