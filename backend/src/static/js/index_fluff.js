// Have Q&A sentences appear in the background in random positions of the main homepage.
// These sentences would seem like there getting typed out by someone. (see css typewriter effect)

const sentences = [
  "Q: What does mitochondria produce?\nA: ATP Energy",
  "Q: What is reproduction?\nA: A biological process when an organisms produces it’s own kind.",
  "Q: What is 1+1?\nA: 2.",
];
const maxDivs = Math.floor((window.innerWidth * window.innerHeight) / 50000);
const maxWidth = 350;
const activeElements = [];

window.addEventListener("load", () => {
  const body = document.body;

  const interval = setInterval(async () => {
    if (activeElements.length > maxDivs) {
      // Remove a random element
      return;
    }

    const div = document.createElement("div");
    div.className = "sentence-box css-typing";
    div.style.position = "absolute";

    div.style.top = `${Math.floor(Math.random() * window.innerHeight)}px`;
    div.style.left = `${Math.floor(Math.random() * Math.max(window.innerWidth - 350, 0))}px`;

    const p1 = document.createElement("p");
    const p2 = document.createElement("p");
    const sentence_parts = sentences[Math.floor(Math.random() * sentences.length)].split("\n");
    p1.innerText = sentence_parts[0];
    p2.innerText = sentence_parts[1];

    div.appendChild(p1);
    div.appendChild(p2);
    body.appendChild(div);
  }, 5000);

  // Populate the page with multiple <div> in random locations. We limit the number of our custom <div> elements based on the surface area
  // of the users screen

  // Inside these <div> elements, we select a random sentence from sentences. From this we add a <p> element inside the <div>
  //console.log(maxDivs)
});
