// 得句巣の Turbo / Stimulus は静的化にあたって載せていないため、
// 同じマークアップのまま動く必要最低限のふるまいだけを素の JS で再実装している。
//
// - toast: サービス終了により動作しないリンク・ボタン (data-service-ended) の代替

document.addEventListener("DOMContentLoaded", () => {
  const toast = document.querySelector("[data-toast]")
  let timer = null
  document.querySelectorAll("[data-service-ended]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault()
      toast.classList.add("is-active")
      clearTimeout(timer)
      timer = setTimeout(() => toast.classList.remove("is-active"), 8000)
    })
  })
})
