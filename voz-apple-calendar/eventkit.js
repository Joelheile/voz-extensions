// Runs in osascript (JavaScript for Automation) and talks to Calendar through EventKit.
// Usage: osascript -l JavaScript eventkit.js <list|add|update|remove> '<json>'
ObjC.import("EventKit");

const notDetermined = 0;
const fullAccess = 3;
const day = 86400;
const free = 1;

function run([command, json]) {
  requestAccess();
  const store = $.EKEventStore.alloc.init;
  const input = JSON.parse(json);
  if (command === "list") return JSON.stringify(list(store, input));
  if (command === "add") return JSON.stringify(add(store, input));
  if (command === "update") return JSON.stringify(update(store, input));
  if (command === "remove") return JSON.stringify(remove(store, input));
  throw new Error(`Unknown command ${command}`);
}

function requestAccess() {
  if (accessStatus() === notDetermined) {
    $.EKEventStore.alloc.init.requestFullAccessToEventsWithCompletion(() => {});
    const giveUp = Date.now() + 6_000;
    while (accessStatus() === notDetermined && Date.now() < giveUp)
      $.NSRunLoop.currentRunLoop.runUntilDate(
        $.NSDate.dateWithTimeIntervalSinceNow(0.1),
      );
  }
  if (accessStatus() !== fullAccess)
    throw new Error(
      "Voz has no access to Calendar. Allow it in System Settings > Privacy & Security > Calendars.",
    );
}

function accessStatus() {
  return Number(
    $.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent),
  );
}

function list(store, { from, days }) {
  const start = date(from);
  const predicate = store.predicateForEventsWithStartDateEndDateCalendars(
    start,
    start.dateByAddingTimeInterval(days * day),
    store.calendarsForEntityType($.EKEntityTypeEvent),
  );
  const events = [];
  const found = store.eventsMatchingPredicate(predicate);
  for (let index = 0; index < found.count; index++) {
    const event = found.objectAtIndex(index);
    events.push({
      id: ObjC.unwrap(event.eventIdentifier),
      title: ObjC.unwrap(event.title) ?? "",
      start: milliseconds(event.startDate),
      end: milliseconds(event.endDate),
      location: ObjC.unwrap(event.location) ?? "",
      allDay: event.allDay,
      free: Number(event.availability) === free,
      invited:
        event.hasAttendees &&
        !event.organizer.isNil() &&
        !event.organizer.isCurrentUser,
      writable: event.calendar.allowsContentModifications,
    });
  }
  const calendars = writableCalendars(store);
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

function add(store, { calendar, title, location, start, end }) {
  const event = $.EKEvent.eventWithEventStore(store);
  event.calendar = store.calendarWithIdentifier(calendar);
  event.title = title;
  if (location) event.location = location;
  event.startDate = date(start);
  event.endDate = date(end);
  save(store, event);
  return { id: ObjC.unwrap(event.eventIdentifier) };
}

function update(store, { id, occurrence, title, location, start, end }) {
  const event = find(store, id, occurrence);
  event.title = title;
  event.location = location;
  event.startDate = date(start);
  event.endDate = date(end);
  save(store, event);
  return { id };
}

function remove(store, { id, occurrence }) {
  const event = find(store, id, occurrence);
  const error = $();
  if (!store.removeEventSpanCommitError(event, $.EKSpanThisEvent, true, error))
    throw new Error(
      ObjC.unwrap(error.localizedDescription) ??
        "Calendar did not remove the event",
    );
  return { id };
}

function find(store, id, occurrence) {
  const start = date(occurrence);
  const found = store.eventsMatchingPredicate(
    store.predicateForEventsWithStartDateEndDateCalendars(
      start,
      start.dateByAddingTimeInterval(60),
      store.calendarsForEntityType($.EKEntityTypeEvent),
    ),
  );
  for (let index = 0; index < found.count; index++) {
    const event = found.objectAtIndex(index);
    if (
      ObjC.unwrap(event.eventIdentifier) === id &&
      milliseconds(event.startDate) === occurrence
    )
      return event;
  }
  throw new Error("That event no longer exists");
}

function save(store, event) {
  const error = $();
  if (!store.saveEventSpanCommitError(event, $.EKSpanThisEvent, true, error))
    throw new Error(
      ObjC.unwrap(error.localizedDescription) ??
        "Calendar did not save the event",
    );
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

function milliseconds(nsDate) {
  return Math.round(nsDate.timeIntervalSince1970 * 1000);
}

function date(ms) {
  return $.NSDate.dateWithTimeIntervalSince1970(ms / 1000);
}
