(function () {
  'use strict';

  var STORAGE_KEY = 'travel-planner.v1';
  var MAX_DAYS = 60;
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD'];

  var state = load();
  var editingId = null; // id of the activity being edited, if any
  var focusDay = null; // day whose "add" form should take focus after a render

  var listEl = document.getElementById('trip-list');
  var mainEl = document.getElementById('main');
  document.getElementById('new-trip').addEventListener('click', createTrip);

  render();

  // ---------- storage ----------

  function load() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.trips)) return saved;
    } catch (err) {
      // Unreadable or unavailable storage: start with an empty planner.
    }
    return { trips: [], activeId: null };
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Storage full or blocked: the planner keeps working for this session.
    }
  }

  // ---------- helpers ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else if (key in node && key !== 'list') node[key] = value;
        else node.setAttribute(key, value);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    var date = new Date(iso + 'T00:00:00Z');
    return isNaN(date.getTime()) ? null : date;
  }

  function addDays(date, count) {
    return new Date(date.getTime() + count * 86400000);
  }

  function tripDays(trip) {
    var start = parseDate(trip.start);
    var end = parseDate(trip.end);
    if (!start || !end || end < start) return [];
    var days = [];
    for (var d = start; d <= end && days.length < MAX_DAYS; d = addDays(d, 1)) {
      days.push(isoDate(d));
    }
    return days;
  }

  function totalDays(trip) {
    var start = parseDate(trip.start);
    var end = parseDate(trip.end);
    if (!start || !end || end < start) return 0;
    return Math.round((end - start) / 86400000) + 1;
  }

  function formatDay(iso) {
    return parseDate(iso).toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
  }

  function formatRange(trip) {
    var start = parseDate(trip.start);
    var end = parseDate(trip.end);
    if (!start || !end) return 'No dates yet';
    var opts = { month: 'short', day: 'numeric', timeZone: 'UTC' };
    return start.toLocaleDateString(undefined, opts) + ' – ' + end.toLocaleDateString(undefined, opts);
  }

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency, maximumFractionDigits: 2,
      }).format(amount);
    } catch (err) {
      return currency + ' ' + amount.toFixed(2);
    }
  }

  function toAmount(value) {
    var n = parseFloat(value);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  function activeTrip() {
    for (var i = 0; i < state.trips.length; i++) {
      if (state.trips[i].id === state.activeId) return state.trips[i];
    }
    return null;
  }

  function dayActivities(trip, day) {
    var list = (trip.days[day] || []).slice();
    list.sort(function (a, b) {
      return (a.time || '99:99').localeCompare(b.time || '99:99');
    });
    return list;
  }

  function dayTotal(trip, day) {
    return (trip.days[day] || []).reduce(function (sum, a) { return sum + a.cost; }, 0);
  }

  // ---------- actions ----------

  function commit() {
    save();
    render();
  }

  function createTrip() {
    var today = new Date();
    var start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    var trip = {
      id: uid(),
      name: 'Untitled trip',
      destination: '',
      start: isoDate(start),
      end: isoDate(addDays(start, 2)),
      budget: 0,
      currency: 'USD',
      days: {},
    };
    state.trips.unshift(trip);
    state.activeId = trip.id;
    editingId = null;
    commit();
    var title = document.getElementById('trip-title');
    if (title) { title.focus(); title.select(); }
  }

  function deleteTrip(trip) {
    if (!window.confirm('Delete "' + trip.name + '"? This cannot be undone.')) return;
    state.trips = state.trips.filter(function (t) { return t.id !== trip.id; });
    state.activeId = state.trips.length ? state.trips[0].id : null;
    editingId = null;
    commit();
  }

  function updateTrip(trip, field, value) {
    if (field === 'budget') value = toAmount(value);
    if (field === 'name') value = value.trim() || 'Untitled trip';
    if (field === 'destination') value = value.trim();
    trip[field] = value;
    // Keep the end date on or after the start date.
    if (field === 'start' && parseDate(trip.start) && (!parseDate(trip.end) || trip.end < trip.start)) {
      trip.end = trip.start;
    }
    if (field === 'end' && parseDate(trip.end) && parseDate(trip.start) && trip.end < trip.start) {
      trip.start = trip.end;
    }
    commit();
  }

  function saveActivity(trip, day, form, existing) {
    var title = form.elements.title.value.trim();
    if (!title) { form.elements.title.focus(); return; }
    var data = {
      time: form.elements.time.value,
      title: title,
      notes: form.elements.notes.value.trim(),
      cost: toAmount(form.elements.cost.value),
    };
    if (existing) {
      Object.assign(existing, data);
      editingId = null;
    } else {
      data.id = uid();
      if (!trip.days[day]) trip.days[day] = [];
      trip.days[day].push(data);
      focusDay = day;
    }
    commit();
  }

  function deleteActivity(trip, day, activity) {
    trip.days[day] = (trip.days[day] || []).filter(function (a) { return a.id !== activity.id; });
    if (!trip.days[day].length) delete trip.days[day];
    commit();
  }

  // ---------- rendering ----------

  function render() {
    renderList();
    renderMain();
    if (focusDay) {
      var input = document.querySelector('[data-add-form="' + focusDay + '"] input[name="title"]');
      if (input) input.focus();
      focusDay = null;
    }
  }

  function renderList() {
    listEl.replaceChildren();
    state.trips.forEach(function (trip) {
      listEl.appendChild(
        el('button', {
          type: 'button',
          class: 'trip-link',
          'aria-current': trip.id === state.activeId ? 'true' : null,
          onclick: function () {
            state.activeId = trip.id;
            editingId = null;
            commit();
          },
        },
          el('span', { class: 'trip-link-name', text: trip.name }),
          el('span', { class: 'trip-link-meta', text: (trip.destination ? trip.destination + ' · ' : '') + formatRange(trip) })
        )
      );
    });
  }

  function renderMain() {
    mainEl.replaceChildren();
    var trip = activeTrip();
    if (!trip) {
      mainEl.appendChild(
        el('div', { class: 'empty' },
          el('h1', { text: 'Where to next?' }),
          el('p', { text: 'Start a trip to lay out each day, add what you plan to do, and keep an eye on the budget.' }),
          el('button', { type: 'button', class: 'btn btn-primary', text: 'Plan a trip', onclick: createTrip })
        )
      );
      return;
    }

    mainEl.appendChild(renderHead(trip));
    mainEl.appendChild(renderDetails(trip));
    mainEl.appendChild(renderBudget(trip));

    var days = tripDays(trip);
    if (!days.length) {
      mainEl.appendChild(el('p', { class: 'notice', text: 'Set a start and end date to lay out the days of this trip.' }));
      return;
    }
    if (totalDays(trip) > MAX_DAYS) {
      mainEl.appendChild(el('p', { class: 'notice', text: 'Showing the first ' + MAX_DAYS + ' days of this trip.' }));
    }
    days.forEach(function (day, index) {
      mainEl.appendChild(renderDay(trip, day, index));
    });
  }

  function renderHead(trip) {
    return el('div', { class: 'trip-head' },
      el('input', {
        id: 'trip-title',
        class: 'trip-title',
        type: 'text',
        value: trip.name,
        maxLength: 80,
        'aria-label': 'Trip name',
        onchange: function (e) { updateTrip(trip, 'name', e.target.value); },
      }),
      el('div', { class: 'trip-actions' },
        el('button', { type: 'button', class: 'btn btn-quiet', text: 'Print', onclick: function () { window.print(); } }),
        el('button', { type: 'button', class: 'btn btn-quiet btn-danger', text: 'Delete trip', onclick: function () { deleteTrip(trip); } })
      )
    );
  }

  function field(labelText, input, wide) {
    var id = 'f-' + uid();
    input.id = id;
    return el('div', { class: wide ? 'field-wide' : null },
      el('label', { htmlFor: id, text: labelText }),
      input
    );
  }

  function renderDetails(trip) {
    var currency = el('select', {
      onchange: function (e) { updateTrip(trip, 'currency', e.target.value); },
    });
    CURRENCIES.forEach(function (code) {
      currency.appendChild(el('option', { value: code, text: code, selected: code === trip.currency }));
    });

    return el('div', { class: 'details' },
      field('Destination', el('input', {
        type: 'text', value: trip.destination, maxLength: 80, placeholder: 'City or region',
        onchange: function (e) { updateTrip(trip, 'destination', e.target.value); },
      }), true),
      field('Start', el('input', {
        type: 'date', value: trip.start,
        onchange: function (e) { updateTrip(trip, 'start', e.target.value); },
      })),
      field('End', el('input', {
        type: 'date', value: trip.end,
        onchange: function (e) { updateTrip(trip, 'end', e.target.value); },
      })),
      field('Budget', el('input', {
        type: 'number', min: '0', step: '0.01', inputMode: 'decimal',
        value: trip.budget ? String(trip.budget) : '', placeholder: '0',
        onchange: function (e) { updateTrip(trip, 'budget', e.target.value); },
      })),
      field('Currency', currency)
    );
  }

  function stat(label, value, over) {
    return el('div', { class: over ? 'stat-over' : null },
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', text: value })
    );
  }

  function renderBudget(trip) {
    var planned = Object.keys(trip.days).reduce(function (sum, day) {
      return sum + dayTotal(trip, day);
    }, 0);
    var hasBudget = trip.budget > 0;
    var over = hasBudget && planned > trip.budget;
    var box = el('section', { class: 'budget', 'aria-label': 'Budget' });
    var row = el('div', { class: 'budget-row' }, stat('Planned', money(planned, trip.currency)));

    if (hasBudget) {
      row.appendChild(stat('Budget', money(trip.budget, trip.currency)));
      row.appendChild(
        over
          ? stat('Over by', money(planned - trip.budget, trip.currency), true)
          : stat('Remaining', money(trip.budget - planned, trip.currency))
      );
    }
    var count = totalDays(trip);
    if (count > 0) row.appendChild(stat('Per day', money(planned / count, trip.currency)));
    box.appendChild(row);

    if (hasBudget) {
      var fill = el('div', { class: 'meter-fill' });
      fill.style.width = Math.min(100, (planned / trip.budget) * 100) + '%';
      box.appendChild(el('div', { class: 'meter' + (over ? ' meter-over' : '') }, fill));
    }
    return box;
  }

  function renderDay(trip, day, index) {
    var section = el('section', { class: 'day' },
      el('div', { class: 'day-head' },
        el('span', { class: 'day-num', text: 'Day ' + (index + 1) }),
        el('h2', { class: 'day-date', text: formatDay(day) }),
        el('span', { class: 'day-total', text: money(dayTotal(trip, day), trip.currency) })
      )
    );

    var activities = dayActivities(trip, day);
    if (!activities.length) {
      section.appendChild(el('p', { class: 'day-empty', text: 'Nothing planned yet.' }));
    }
    activities.forEach(function (activity) {
      section.appendChild(
        activity.id === editingId
          ? renderForm(trip, day, activity)
          : renderActivity(trip, day, activity)
      );
    });
    section.appendChild(renderForm(trip, day, null));
    return section;
  }

  function renderActivity(trip, day, activity) {
    return el('div', { class: 'activity' },
      el('span', { class: 'activity-time', text: activity.time || '—' }),
      el('div', null,
        el('div', { class: 'activity-title', text: activity.title }),
        activity.notes ? el('div', { class: 'activity-notes', text: activity.notes }) : null
      ),
      el('span', { class: 'activity-cost', text: activity.cost ? money(activity.cost, trip.currency) : '' }),
      el('div', { class: 'activity-tools' },
        el('button', {
          type: 'button', class: 'btn btn-quiet', text: 'Edit',
          'aria-label': 'Edit ' + activity.title,
          onclick: function () { editingId = activity.id; render(); },
        }),
        el('button', {
          type: 'button', class: 'btn btn-quiet btn-danger', text: 'Remove',
          'aria-label': 'Remove ' + activity.title,
          onclick: function () { deleteActivity(trip, day, activity); },
        })
      )
    );
  }

  function renderForm(trip, day, existing) {
    var form = el('form', {
      class: 'activity-form' + (existing ? ' is-editing' : ''),
      'data-add-form': existing ? null : day,
      onsubmit: function (e) {
        e.preventDefault();
        saveActivity(trip, day, form, existing);
      },
    },
      el('input', {
        name: 'time', type: 'time', 'aria-label': 'Time',
        value: existing ? existing.time : '',
      }),
      el('input', {
        name: 'title', type: 'text', maxLength: 120, class: 'field-wide',
        placeholder: 'Add an activity', 'aria-label': 'Activity',
        value: existing ? existing.title : '',
      }),
      el('input', {
        name: 'notes', type: 'text', maxLength: 300, class: 'field-wide',
        placeholder: 'Notes (optional)', 'aria-label': 'Notes',
        value: existing ? existing.notes : '',
      }),
      el('input', {
        name: 'cost', type: 'number', min: '0', step: '0.01', inputMode: 'decimal',
        placeholder: 'Cost', 'aria-label': 'Cost in ' + trip.currency,
        value: existing && existing.cost ? String(existing.cost) : '',
      }),
      el('div', { class: 'form-buttons' },
        el('button', { type: 'submit', class: 'btn' + (existing ? ' btn-primary' : ''), text: existing ? 'Save' : 'Add' }),
        existing
          ? el('button', {
              type: 'button', class: 'btn btn-quiet', text: 'Cancel',
              onclick: function () { editingId = null; render(); },
            })
          : null
      )
    );
    return form;
  }
})();
