document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.md-content a[href]').forEach(function (a) {
    if (!a.href.startsWith(window.location.origin)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
})
