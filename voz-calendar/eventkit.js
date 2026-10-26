// Runs in osascript (JavaScript for Automation) and talks to Calendar through EventKit.
// Usage: osascript -l JavaScript eventkit.js <list|add|move> '<json>'
ObjC.import("EventKit");

const fullAccess = 3;
const day = 86400;

function run([command, json]) {
  const store = $.EKEventStore.alloc.init;
  requestAccess(store);
  const input = JSON.parse(json);
  if (command === "list") return JSON.stringify(list(store, input));
  if (command === "add") return JSON.stringify(add(store, input));
  if (command === "move") return JSON.stringify(move(store, input));
  throw new Error(`Unknown command ${command}`);
}

function requestAccess(store) {
  if (
    Number(
      $.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent),
    ) === fullAccess
  )
    return;
  let answered = false;
  let granted = false;
  store.requestFullAccessToEventsWithCompletion((allowed) => {
    granted = allowed;
    answered = true;
  });
  const giveUp = Date.now() + 60_000;
  while (!answered && Date.now() < giveUp)
    $.NSRunLoop.currentRunLoop.runUntilDate(
      $.NSDate.dateWithTimeIntervalSinceNow(0.1),
    );
  if (!granted)
    throw new Error(
      "Voz has no access to Calendar. Allow it in System Settings > Privacy & Security > Calendars.",
    );
}

function list(store, { days }) {
  const calendars = writableCalendars(store);
  const start = $.NSDate.date;
  const predicate = store.predicateForEventsWithStartDateEndDateCalendars(
    start,
    start.dateByAddingTimeInterval(days * day),
    calendarArray(calendars),
  );
  const events = [];
  const found = store.eventsMatchingPredicate(predicate);
  for (let index = 0; index < found.count; index++) {
    const event = found.objectAtIndex(index);
    if (event.allDay) continue;
    events.push({
      id: ObjC.unwrap(event.eventIdentifier),
      title: ObjC.unwrap(event.title),
      start: milliseconds(event.startDate),
      end: milliseconds(event.endDate),
    });
  }
  const fallback = store.defaultCalendarForNewEvents;
  return {
    calendars: calendars.map((calendar) => ({
      id: ObjC.unwrap(calendar.calendarIdentifier),
      title: ObjC.unwrap(calendar.title),
      account: ObjC.unwrap(calendar.source.title),
    })),
    defaultCalendar: fallback.isNil()
      ? null
      : ObjC.unwrap(fallback.calendarIdentifier),
    events,
  };
}

function add(store, { calendar, title, start, end }) {
  const event = $.EKEvent.eventWithEventStore(store);
  event.calendar = store.calendarWithIdentifier(calendar);
  event.title = title;
  event.startDate = date(start);
  event.endDate = date(end);
  save(store, event);
  return { id: ObjC.unwrap(event.eventIdentifier) };
}

function move(store, { id, start, end }) {
  const event = store.eventWithIdentifier(id);
  if (event.isNil()) throw new Error("That event no longer exists");
  event.startDate = date(start);
  event.endDate = date(end);
  save(store, event);
  return { id };
}

function save(store, event) {
  const error = $();
  if (!store.saveEventSpanCommitError(event, $.EKSpanThisEvent, true, error)) {
    throw new Error(
      ObjC.unwrap(error.localizedDescription) ??
        "Calendar did not save the event",
    );
  }
}

function writableCalendars(store) {
  const all = store.calendarsForEntityType($.EKEntityTypeEvent);
  const calendars = [];
  for (let index = 0; index < all.count; index++) {
    const calendar = all.objectAtIndex(index);
    if (calendar.allowsContentModifications) calendars.push(calendar);
  }
  return calendars;
}

function calendarArray(calendars) {
  const array = $.NSMutableArray.array;
  calendars.forEach((calendar) => array.addObject(calendar));
  return array;
}

function milliseconds(nsDate) {
  return Math.round(nsDate.timeIntervalSince1970 * 1000);
}

function date(ms) {
  return $.NSDate.dateWithTimeIntervalSince1970(ms / 1000);
}
