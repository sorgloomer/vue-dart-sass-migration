<template>
  <div></div>
</template>

<script setup>
</script>

<style lang="scss" scoped>
.foo {
  baz: 101px;
}

.foo .bar {
  baz: 102px;
}

/deep/ .bar {
  baz: 1px;
}

>>> .bar {
  baz: 2px;
}

.foo /deep/ .bar {
  baz: 3px;
}

.foo >>> .bar {
  baz: 4px;
}

.foo /deep/ {
  baz: 5px;
}

:deep() {
  baz: 6px;
}

:deep() .bar {
  baz: 7px;
}

:deep(.bar) {
  baz: 8px;
}

.foo :deep(.bar) {
  baz: 9px;
}

.foo :deep(.bar) {
  &__title {
    baz: 10px;
  }
}

</style>
