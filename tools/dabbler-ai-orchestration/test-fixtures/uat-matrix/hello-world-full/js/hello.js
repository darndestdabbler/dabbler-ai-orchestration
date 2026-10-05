// Renders the greeting. Session 2 of set 001-hello-page is mid-flight
// adding the date stamp below.
(function () {
  const target = document.getElementById("greeting");
  if (!target) return;
  const heading = document.createElement("h1");
  heading.textContent = "Hello, world!";
  target.appendChild(heading);
})();
