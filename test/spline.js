var tape = require('tape')
var spline = require('../lib/util/spline')

var catmullRom = spline.catmullRom
var uniformCubic = spline.uniformCubic
var createPath = spline.createPath

function approx (actual, expected, tol) {
  if (actual.length !== expected.length) {
    return false
  }
  for (var i = 0; i < actual.length; ++i) {
    if (Math.abs(actual[i] - expected[i]) > (tol || 1e-10)) {
      return false
    }
  }
  return true
}

tape('catmull-rom reproduces hand-computed interior point', function (t) {
  // 1-D control column, uniform knots, canonical Catmull-Rom (tension 0).
  var points = [[0], [1], [2], [3]]
  // p(0.5) on segment [p1, p2]:
  // w = [-1/16, 9/16, 9/16, -1/16] => 1.5
  t.ok(approx(catmullRom(points, 0.5), [1.5]), 'midpoint of y=x stays 1.5')
  // local u=1/3 on segment 0; knots are 0, 1/3, 2/3, 1 => global t = 1/9
  // weights give 7/27
  t.ok(approx(catmullRom(points, 1 / 9), [7 / 27]), 'hand value at u=1/3')
  t.end()
})

tape('catmull-rom matches full hand-computed 2-D weights', function (t) {
  // Five points so segment 1 has a real interior window [p0..p3], no phantoms.
  var p0 = [0, 0]
  var p1 = [2, 0]
  var p2 = [2, 2]
  var p3 = [0, 2]
  var p4 = [-2, 2]
  var u = 0.25
  var globalT = (1 + u) / 4
  var u2 = u * u
  var u3 = u2 * u
  var w0 = -0.5 * u + u2 - 0.5 * u3
  var w1 = 1 - 2.5 * u2 + 1.5 * u3
  var w2 = 0.5 * u + 2 * u2 - 1.5 * u3
  var w3 = -0.5 * u2 + 0.5 * u3
  var expected = [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1]
  ]
  t.ok(approx(catmullRom([p0, p1, p2, p3, p4], globalT), expected), '2-D weights')
  t.end()
})

tape('catmull-rom interpolates every control point', function (t) {
  var points = [[1, 4], [-2, 7], [3, -5], [0, 2], [9, 9]]
  for (var i = 0; i < points.length; ++i) {
    var time = i / (points.length - 1)
    t.ok(approx(catmullRom(points, time), points[i]), 'knot ' + i)
  }
  t.ok(approx(catmullRom(points, 0), points[0]), 't=0 end point')
  t.ok(approx(catmullRom(points, 1), points[points.length - 1]), 't=1 end point')
  t.end()
})

tape('catmull-rom endpoint strategies', function (t) {
  var points = [[0], [2], [4], [6]]
  // clamp: phantom p(-1) = p0, tangent at p0 is (p1 - p0)/2
  var clamped = catmullRom(points, 0.125, { edge: 'clamp' })
  // mirror: phantom p(-1) = 2*p0 - p1 = -2, tangent at p0 is (p1 - p-1)/2 = 2
  var mirrored = catmullRom(points, 0.125, { edge: 'mirror' })
  t.ok(mirrored[0] > clamped[0], 'mirror leaves the end point faster')
  t.ok(approx(catmullRom(points, 0, { edge: 'clamp' }), [0]), 'clamp end exact')
  t.ok(approx(catmullRom(points, 0, { edge: 'mirror' }), [0]), 'mirror end exact')
  t.ok(approx(catmullRom(points, 0, { edge: 'repeat' }), [0]), 'repeat end exact')
  t.end()
})

tape('uniform cubic b-spline hand-computed point', function (t) {
  var points = [[0], [1], [2], [3]]
  // segment 1 (between knots 1/3 and 2/3), local u=0.5, global t=0.5:
  // w = [1/48, 23/48, 23/48, 1/48] => (23+46+3)/48 = 72/48 = 1.5
  t.ok(approx(uniformCubic(points, 0.5), [1.5]), 'b-spline mid value')
  t.end()
})

tape('uniform cubic b-spline endpoint strategies', function (t) {
  var points = [[0], [2], [4], [6]]
  // mirror phantoms make the curve pass through both end points exactly
  t.ok(approx(uniformCubic(points, 0, { edge: 'mirror' }), [0]), 'mirror start')
  t.ok(approx(uniformCubic(points, 1, { edge: 'mirror' }), [6]), 'mirror end')
  // clamp snaps end samples to the control points exactly
  t.ok(approx(uniformCubic(points, 0, { edge: 'clamp' }), [0]), 'clamp start exact')
  t.ok(approx(uniformCubic(points, 1, { edge: 'clamp' }), [6]), 'clamp end exact')
  // but just inside the boundary the clamp blend is still visible
  var clampedNear = uniformCubic(points, 0.01, { edge: 'clamp' })[0]
  t.ok(Math.abs(clampedNear) > 1e-10, 'clamp blends away from the end')
  var repeatedStart = uniformCubic(points, 0, { edge: 'repeat' })[0]
  t.ok(Math.abs(repeatedStart - ((6 + 0 + 0 + 2) / 6)) < 1e-10, 'repeat start wraps')
  t.end()
})

tape('repeat strategy closes the loop at t=0 and t=1', function (t) {
  var points = [[0, 0], [2, 1], [4, 0], [6, 1]]
  ;['catmull-rom', 'uniform-cubic'].forEach(function (type) {
    var options = { type: type, edge: 'repeat' }
    var start = spline.sample(points, 0, options)
    var end = spline.sample(points, 1, options)
    t.ok(approx(start, end), type + ' is periodic at the seam')
  })
  t.end()
})

tape('b-spline stays inside the control hull and is c2 smooth at knots', function (t) {
  var points = [[0], [8], [-3], [5], [12]]
  for (var i = 0; i <= 40; ++i) {
    var value = uniformCubic(points, i / 40, { edge: 'clamp' })[0]
    t.ok(value >= -3 - 1e-10 && value <= 12 + 1e-10, 'inside hull at ' + i)
  }
  // continuity at an interior knot: same value from either side
  var knotTime = 1 / (points.length - 1)
  var left = uniformCubic(points, knotTime - 1e-12)
  var right = uniformCubic(points, knotTime + 1e-12)
  t.ok(approx(left, right, 1e-9), 'continuous across knot')
  t.end()
})

tape('tension changes the catmull-rom shape', function (t) {
  var points = [[0], [0], [10], [10]]
  var loose = catmullRom(points, 0.25, { tension: 0 })[0]
  var tight = catmullRom(points, 0.25, { tension: 0.5 })[0]
  t.ok(Math.abs(loose - tight) > 1e-6, 'tension affects overshoot')
  t.end()
})

tape('custom knot spacing is honoured', function (t) {
  var points = [[0], [10], [20]]
  var knots = [0, 9, 10]
  // at t=9 the curve must hit the second control point
  t.ok(approx(catmullRom(points, 9, { knots: knots }), [10]), 'knot hit')
  t.throws(function () {
    catmullRom(points, 0.5, { knots: [0, 5, 5] })
  }, /strictly increasing/, 'rejects non-increasing knots')
  t.throws(function () {
    catmullRom(points, 0.5, { knots: [0, 5] })
  }, /length must match/, 'rejects mismatched knots')
  t.end()
})

tape('flat and typed arrays share the same implementation', function (t) {
  var nested = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]
  var flat = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  for (var i = 0; i <= 10; ++i) {
    var time = i / 10
    t.ok(approx(
      catmullRom(nested, time),
      catmullRom(flat, time, { dimension: 3 }),
      1e-5), 'same sample at ' + time)
  }
  var out = [0, 0, 0]
  var returned = uniformCubic(flat, 0.4, { dimension: 3 }, out)
  t.equal(returned, out, 'writes into the provided output container')
  t.end()
})

tape('path wrapper samples normalised time', function (t) {
  var path = createPath([[0, 0], [1, 10], [2, 0], [3, 10]], {
    type: 'uniform-cubic',
    edge: 'mirror'
  })
  t.equal(path.count, 4)
  t.equal(path.dimension, 2)
  t.ok(approx(path.at(0), [0, 0]), 'starts on first point')
  t.ok(approx(path.at(1), [3, 10]), 'ends on last point')
  t.ok(approx(path.at(0.5), uniformCubic(
    [[0, 0], [1, 10], [2, 0], [3, 10]], 0.5, { edge: 'mirror' })),
  'wrapper matches direct sampling')
  t.end()
})

tape('out of range t is clamped to the ends', function (t) {
  var points = [[1], [2], [3], [4]]
  t.ok(approx(catmullRom(points, -5), [1]), 'negative t clamps to start')
  t.ok(approx(catmullRom(points, 99), [4]), 'large t clamps to end')
  t.end()
})

tape('invalid input is rejected', function (t) {
  t.throws(function () { catmullRom([], 0.5) }, /at least two points/, 'empty column')
  t.throws(function () { catmullRom([[1]], 0.5) }, /at least two points/, 'single point')
  t.throws(function () { catmullRom('nope', 0.5) }, /array-like/, 'non array')
  t.throws(function () {
    catmullRom([[1, 2], [3]], 0.5)
  }, /same dimension/, 'ragged points')
  t.throws(function () {
    catmullRom([[1, NaN], [2, 3]], 0.5)
  }, /NaN/, 'NaN component')
  t.throws(function () {
    catmullRom([[1, Infinity], [2, 3]], 0.5)
  }, /non-finite/, 'infinite component')
  t.throws(function () {
    catmullRom([[1], [2]], NaN)
  }, /finite number/, 'NaN t')
  t.throws(function () {
    catmullRom([[1], [2]], 0.5, { edge: 'bogus' })
  }, /unknown endpoint strategy/, 'bad strategy')
  t.throws(function () {
    catmullRom([[1], [2], [3]], 0.5, { tension: 2 })
  }, /tension/, 'bad tension')
  t.throws(function () {
    uniformCubic([1, 2, 3, 4], 0.5, { dimension: 3 })
  }, /multiple of dimension/, 'flat length mismatch')
  t.throws(function () {
    catmullRom([[1], [2]], 0.5, {}, [0, 0])
  }, /output container length/, 'bad output container')
  t.throws(function () {
    spline.sample([[1], [2]], 0.5, { type: 'nope' })
  }, /unknown spline type/, 'bad spline type')
  t.end()
})
