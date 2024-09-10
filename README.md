# How to use

```sh
npx github:sorgloomer/vue-dart-sass-migrator <path-to-your-sources>
```

# Transformations

- Runs sass-migrator on all sass and scss files and vue sfc sections
- Replaces `/deep/` and `>>>` with `:deep()`
- Fixes or warns on a few invalid selectors that was a silent error in node-sass
  - If a parent-concatenating selector is nested under a pseudo class selector, like `.bar:not(.foo) { &__baz {  } }`
