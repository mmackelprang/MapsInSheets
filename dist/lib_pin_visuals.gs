// Pure-logic module for computing a pin's visual treatment in group view mode.
// The `all` mode visual (pin.color, opacity 1) is trivial and stays inline in
// Map.html.

var MUTED_COLOR = '#9e9e9e';
var MUTED_OPACITY = 0.15;
var LEADER_SCALE = 1.5;

function computeGroupPinVisual(pin, context) {
  // context = { activeColumn, focusedPin, cycleIndex, palette }
  var col = context.activeColumn;
  var memberships = (pin.groupMembership && pin.groupMembership[col]) || [];

  if (memberships.length === 0) {
    return muted();
  }

  var activeEntry = null;
  var isHero = false;

  if (context.focusedPin) {
    var focusedEntries =
      (context.focusedPin.groupMembership && context.focusedPin.groupMembership[col]) || [];
    if (focusedEntries.length === 0) {
      activeEntry = memberships[0];
    } else {
      var n = focusedEntries.length;
      var safeCycle = ((context.cycleIndex % n) + n) % n;
      var focusedId = focusedEntries[safeCycle].id.toLowerCase();
      activeEntry = memberships.find(function (e) {
        return e.id.toLowerCase() === focusedId;
      });
      if (!activeEntry) {
        return muted();
      }
      isHero = (context.focusedPin === pin);
    }
  } else {
    activeEntry = memberships[0];
  }

  var color = context.palette[activeEntry.id.toLowerCase()];
  if (!color) {
    return muted();
  }

  return {
    color: color,
    opacity: 1,
    scale: activeEntry.isLeader ? LEADER_SCALE : 1,
    star: !!activeEntry.isLeader,
    heroOutline: isHero,
  };
}

function muted() {
  return {
    color: MUTED_COLOR,
    opacity: MUTED_OPACITY,
    scale: 1,
    star: false,
    heroOutline: false,
  };
}
