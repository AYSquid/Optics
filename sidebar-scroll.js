(function(){
  'use strict';
  var sidebar=document.getElementById('sidebar');
  var outer=sidebar&&sidebar.querySelector('.sidebar-scroll');
  var status=sidebar&&sidebar.querySelector('.sidebar-status');
  if(!outer||!status)return;
  // Leave wheel/touch inertia entirely to the browser; keep focused chapters
  // below the sticky filters when native keyboard navigation scrolls them.
  function measure(){outer.style.scrollPaddingTop=(status.offsetHeight+8)+'px';}
  new ResizeObserver(measure).observe(status);
  measure();
})();
