/*
  Shared spline sampling layer.

  Catmull-Rom and uniform cubic (B-spline) sampling built on one generic
  4-point cubic basis so every supported vector representation (arrays of
  vectors, flat/typed arrays with an explicit dimension) goes through the
  exact same arithmetic.

  End point handling strategies:
    'clamp'  - hold the nearest end control point beyond the boundary
    'mirror' - reflect the control points across the end points
    'repeat' - treat the point column as periodic
 */

module.exports = {
  catmullRom: catmullRom,
  uniformCubic: uniformCubic,
  sample: sample,
  createPath: createPath,
  strategies: ['clamp', 'mirror', 'repeat']
}

var DEFAULT_STRATEGY = 'clamp'

// Catmull-Rom basis, tension in [0, 1) (0 gives the canonical centripetal-free
// uniform Catmull-Rom curve).
function catmullWeights (u, tension) {
  var s = (1 - tension) / 2
  var u2 = u * u
  var u3 = u2 * u
  return [
    -s * u + 2 * s * u2 - s * u3,
    1 + (s - 3) * u2 + (2 - s) * u3,
    s * u + (3 - 2 * s) * u2 + (s - 2) * u3,
    -s * u2 + s * u3
  ]
}

// Uniform cubic B-spline basis.
function bSplineWeights (u) {
  var u2 = u * u
  var u3 = u2 * u
  return [
    (1 - 3 * u + 3 * u2 - u3) / 6,
    (4 - 6 * u2 + 3 * u3) / 6,
    (1 + 3 * u + 3 * u2 - 3 * u3) / 6,
    u3 / 6
  ]
}

function isArrayLike (value) {
  if (Array.isArray(value)) {
    return true
  }
  if (!value || typeof value === 'string' || typeof value === 'function') {
    return false
  }
  return typeof value.length === 'number'
}

function isFiniteNumber (value) {
  return typeof value === 'number' && isFinite(value)
}

function resolveStrategy (options) {
  var strategy = options && options.edge
    ? options.edge
    : (options && options.endpoint ? options.endpoint : DEFAULT_STRATEGY)
  if (['clamp', 'mirror', 'repeat'].indexOf(strategy) === -1) {
    throw new Error('unknown endpoint strategy: ' + strategy)
  }
  return strategy
}

// Normalises a point column into { flat: Float64Array, count, dimension }.
function normalisePoints (points, dimension) {
  if (!isArrayLike(points)) {
    throw new Error('points must be an array-like point column')
  }
  if (points.length < 2) {
    throw new Error('at least two points are required')
  }

  var nested = isArrayLike(points[0])
  var count
  var dim
  var flat
  var i
  var j

  if (nested) {
    count = points.length
    dim = points[0].length
    if (!dim) {
      throw new Error('points must have at least one component')
    }
    flat = new Float64Array(count * dim)
    for (i = 0; i < count; ++i) {
      if (!isArrayLike(points[i]) || points[i].length !== dim) {
        throw new Error('all points must share the same dimension')
      }
      for (j = 0; j < dim; ++j) {
        var value = points[i][j]
        if (!isFiniteNumber(value)) {
          throw new Error('point data contains NaN or non-finite values')
        }
        flat[i * dim + j] = value
      }
    }
  } else {
    dim = dimension
    if (!dim || dim < 1) {
      throw new Error('dimension must be a positive integer')
    }
    if (points.length % dim !== 0) {
      throw new Error('flat point column length must be a multiple of dimension')
    }
    count = points.length / dim
    if (count < 2) {
      throw new Error('at least two points are required')
    }
    flat = new Float64Array(count * dim)
    for (i = 0; i < points.length; ++i) {
      if (!isFiniteNumber(points[i])) {
        throw new Error('point data contains NaN or non-finite values')
      }
      flat[i] = points[i]
    }
  }

  return { flat: flat, count: count, dimension: dim }
}

// Resolves a (possibly out of range) control point index into the column.
function resolveIndex (index, count, strategy) {
  if (index >= 0 && index < count) {
    return index
  }
  if (strategy === 'clamp') {
    return Math.max(0, Math.min(count - 1, index))
  }
  if (strategy === 'repeat') {
    var wrapped = index % count
    return wrapped < 0 ? wrapped + count : wrapped
  }
  // mirror: bounce through the end points instead of duplicating them
  var period = 2 * (count - 1)
  var reflected = index % period
  if (reflected < 0) {
    reflected += period
  }
  return reflected >= count ? period - reflected : reflected
}

// Returns the reflected control *value* used by the mirror strategy so that
// an end point is interpolated exactly.
function reflectedValue (flat, index, count, dim, anchor) {
  var offset = anchor * dim
  var sourceIndex = index < 0
    ? -index
    : 2 * (count - 1) - index
  var value = new Array(dim)
  for (var j = 0; j < dim; ++j) {
    value[j] = 2 * flat[offset + j] - flat[sourceIndex * dim + j]
  }
  return value
}

function readControl (flat, index, count, dim, strategy, target) {
  if (index >= 0 && index < count) {
    for (var j = 0; j < dim; ++j) {
      target[j] = flat[index * dim + j]
    }
    return target
  }
  if (strategy === 'mirror') {
    var anchor = index < 0 ? 0 : count - 1
    var reflected = reflectedValue(flat, index, count, dim, anchor)
    for (j = 0; j < dim; ++j) {
      target[j] = reflected[j]
    }
    return target
  }
  var resolved = resolveIndex(index, count, strategy)
  for (j = 0; j < dim; ++j) {
    target[j] = flat[resolved * dim + j]
  }
  return target
}

function locateSegment (t, count, knots, strategy) {
  if (!isFiniteNumber(t)) {
    throw new Error('t must be a finite number')
  }
  if (t <= knots[0]) {
    t = knots[0]
  } else if (t >= knots[count - 1]) {
    t = knots[count - 1]
  }

  var segment = 0
  while (segment < count - 2 && t > knots[segment + 1]) {
    ++segment
  }
  var span = knots[segment + 1] - knots[segment]
  var u = span === 0 ? 0 : (t - knots[segment]) / span

  if (t === knots[count - 1]) {
    if (strategy === 'repeat') {
      // Closing segment runs from the last knot back onto the first one.
      return { segment: count - 1, u: 1, periodic: true, end: true }
    }
    segment = count - 2
    u = 1
  }
  return {
    segment: segment,
    u: u,
    periodic: strategy === 'repeat',
    end: t === knots[count - 1]
  }
}

function buildKnots (count, options) {
  var knots = new Float64Array(count)
  var spacing = options && options.knots
  var i
  if (isArrayLike(spacing)) {
    if (spacing.length !== count) {
      throw new Error('knot vector length must match the number of points')
    }
    for (i = 0; i < count; ++i) {
      if (!isFiniteNumber(spacing[i])) {
        throw new Error('knot vector contains NaN or non-finite values')
      }
      knots[i] = spacing[i]
    }
    for (i = 1; i < count; ++i) {
      if (knots[i] <= knots[i - 1]) {
        throw new Error('knot vector must be strictly increasing')
      }
    }
    return knots
  }
  for (i = 0; i < count; ++i) {
    knots[i] = i / (count - 1)
  }
  return knots
}

function writePoint (flat, pointIndex, dim, out) {
  var result = out || new Array(dim)
  for (var j = 0; j < dim; ++j) {
    result[j] = flat[pointIndex * dim + j]
  }
  return result
}

function cubicSample (points, t, weightsAt, options, out) {
  var model = normalisePoints(points, options && options.dimension)
  var strategy = resolveStrategy(options)
  var knots = buildKnots(model.count, options)
  var location = locateSegment(t, model.count, knots, strategy)
  var dim = model.dimension

  if (isArrayLike(out) && out.length !== dim) {
    throw new Error('output container length must match the point dimension')
  }

  // End points are defined to be exact, regardless of the phantom-point
  // arithmetic used by the chosen endpoint strategy. The periodic repeat
  // strategy keeps its own wrap-around semantics instead.
  if (strategy !== 'repeat' && !location.periodic) {
    if (location.u === 0 && location.segment === 0) {
      return writePoint(model.flat, 0, model.dimension, out)
    }
    if (location.u === 1 && location.segment === model.count - 2) {
      return writePoint(model.flat, model.count - 1, model.dimension, out)
    }
  }

  var weights = weightsAt(location.u)

  var result = out || new Array(dim)

  var segment = location.segment
  var indices = [segment - 1, segment, segment + 1, segment + 2]
  var control = [
    new Array(dim),
    new Array(dim),
    new Array(dim),
    new Array(dim)
  ]
  for (var k = 0; k < 4; ++k) {
    readControl(model.flat, indices[k], model.count, dim, strategy, control[k])
  }

  for (var j = 0; j < dim; ++j) {
    var sum = 0
    for (k = 0; k < 4; ++k) {
      sum += weights[k] * control[k][j]
    }
    result[j] = sum
  }
  return result
}

function catmullRom (points, t, options, out) {
  var settings = options || {}
  var tension = settings.tension
  if (tension === undefined || tension === null) {
    tension = 0
  }
  if (!isFiniteNumber(tension) || tension < 0 || tension >= 1) {
    throw new Error('tension must be a finite number in [0, 1)')
  }
  return cubicSample(points, t, function (u) {
    return catmullWeights(u, tension)
  }, settings, out)
}

function uniformCubic (points, t, options, out) {
  var settings = options || {}
  return cubicSample(points, t, bSplineWeights, settings, out)
}

function linearWeights (u) {
  return [0, 1 - u, u, 0]
}

// Generic entry point; type is one of 'linear', 'catmull-rom', 'uniform-cubic'.
function sample (points, t, options, out) {
  var settings = options || {}
  var type = settings.type || 'catmull-rom'
  if (type === 'linear') {
    return cubicSample(points, t, linearWeights, settings, out)
  }
  if (type === 'catmull-rom' || type === 'catmullRom') {
    return catmullRom(points, t, settings, out)
  }
  if (type === 'uniform-cubic' || type === 'uniformCubic') {
    return uniformCubic(points, t, settings, out)
  }
  throw new Error('unknown spline type: ' + type)
}

// Path wrapper: holds a point column and samples it by normalised time.
function createPath (points, options) {
  var settings = options || {}
  var model = normalisePoints(points, settings.dimension)
  var knots = buildKnots(model.count, settings)

  function at (t, out) {
    return sample(model.flat, t, {
      type: settings.type || 'catmull-rom',
      edge: resolveStrategy(settings),
      tension: settings.tension,
      dimension: model.dimension,
      knots: Array.prototype.slice.call(knots)
    }, out)
  }

  return {
    at: at,
    dimension: model.dimension,
    count: model.count,
    knots: Array.prototype.slice.call(knots)
  }
}
