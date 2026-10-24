// Every pooja the site offers. A pooja becomes available once its full content
// (steps with verified mantras, katha, samagri) is in its own file like
// satyanarayan.js; the live session and the chat both read from it.
import { satyanarayan } from "./satyanarayan.js"

export const poojas = [
  { ...satyanarayan, available: true },
  { id: "ganesh", name: "Ganesh Pooja", nameHi: "गणेश पूजा", summary: "Pooja of Shri Ganesh before any new beginning.", available: false },
  { id: "griha-pravesh", name: "Griha Pravesh", nameHi: "गृह प्रवेश", summary: "Entering a new home with vastu pooja and havan.", available: false },
  { id: "lakshmi", name: "Lakshmi Pooja", nameHi: "लक्ष्मी पूजा", summary: "Diwali and Kojagara Lakshmi pooja, as done in Mithila.", available: false },
  { id: "chhath", name: "Chhath Pooja", nameHi: "छठ पूजा", summary: "Arghya to Surya Dev and Chhathi Maiya over four days.", available: false },
  { id: "rudrabhishek", name: "Rudrabhishek", nameHi: "रुद्राभिषेक", summary: "Abhishek of Bhagwan Shiva with the Rudri path.", available: false },
]

export const poojaById = (id) => poojas.find((p) => p.id === id)
