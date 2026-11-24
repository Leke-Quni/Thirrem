# Each app runs its own self-contained Sandbox

Thirrem is three independent web apps (Rider, Driver, Admin), each with its own landing page, signup and Sandbox. A Sandbox is a private simulated world that fully contains every Ride Request and Ride, with simulated actors filling the other roles, so a visitor can test any app on its own. We rejected one shared world, which lets visitors wreck each other's demo, and a single Sandbox linked across the three apps, which needs shared identity and cross-app coordination.

## Consequences

- The apps never interact with each other: a Rider in the Rider app never meets a Driver in the Driver app.
- Each Sandbox needs its own continuously running simulation, so concurrent Sandboxes are capped (initially 30) and stopped after inactivity.
- A linked mode joining the apps into one shared world is a possible later feature, not a goal of the first version.
