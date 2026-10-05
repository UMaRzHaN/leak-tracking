export const mainPage = {
  showAll: "All {{count}} →",

  chips: {
    label: "Status filter",
    all: "All",
    open: "Open",
    inProgress: "Repair",
    resolved: "Resolved",
  },

  groups: {
    today: "Today",
    yesterday: "Yesterday",
    earlier: "Earlier",
  },

  coverage: {
    title: "Survey coverage",
    value: "{{surveyed}} of {{total}} · {{percent}}%",
    hint: "Sites with leak records",
    noRegistry:
      "Sites with leak records. The total appears with the component registry",
  },

  repairs: {
    title: "Repairs",
    inProgress: "in progress",
    returned: "came back",
    completed: "completed",
    median: "usually repaired in {{value}}",
    longestOpen: "oldest open repair: {{value}}",
    returnedTitle: "Came back after a repair",
    attempts: "repair attempts: {{count}}",
    more: "and {{count}} more",
    noTag: "no tag",
    days: "{{count}} d",
    hours: "{{count}} h",
    minutes: "{{count}} min",
  },
};
