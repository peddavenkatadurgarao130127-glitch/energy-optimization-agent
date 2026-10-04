const DAYS = 30;
const KG_PER_TREE = 21;

const num = (v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const base = (a) => num(a.qty) * num(a.watts) * num(a.hours) * DAYS / 1000;

function compute(items, tariff, ef) {
  const rows = items.map(a => ({ a, kwh: base(a) }));
  const total = rows.reduce((s, r) => s + r.kwh, 0);
  return {
    rows,
    total,
    cost: total * tariff,
    co2: total * ef
  };
}

function buildRecs(items, settings) {
  const recs = [];
  const add = (a, key, r) => {
    if (r.kwh < 0.5) return;
    r.id = `${a.id}:${key}`;
    r.cost = r.kwh * settings.tariff;
    r.co2 = r.kwh * settings.ef;
    r.payback = r.upfront > 0 && r.cost > 0 ? r.upfront / r.cost : 0;
    recs.push(r);
  };

  items.forEach(a => {
    const b = base(a);
    if (b <= 0) return;

    switch (a.kind) {
      case "ac": {
        const cut = Math.min(0.25, 0.05 * Math.max(0, 25 - settings.setpoint));
        let rem = b;
        if (cut > 0) {
          add(a, "setpoint", {
            title: `Set ${a.name} to 25 °C`,
            why: `You run it at ${settings.setpoint} °C. Each degree warmer trims about 5% off cooling energy.`,
            kwh: b * cut, upfront: 0, effort: "free"
          });
          rem *= 1 - cut;
        }
        if (a.hours >= 5) {
          add(a, "hours", {
            title: `Run ${a.name} one hour less`,
            why: `It runs ${a.hours} hours a day. Use the sleep timer and reduce cooling time.`,
            kwh: rem / a.hours, upfront: 0, effort: "free"
          });
          rem *= 1 - 1 / a.hours;
        }
        if (a.watts >= 1200) {
          add(a, "upgrade", {
            title: `Replace ${a.name} with a 5-star inverter AC`,
            why: "A 5-star inverter model is estimated to use about 30% less energy.",
            kwh: rem * 0.3, upfront: 15000 * a.qty, effort: "invest"
          });
        }
        break;
      }
      case "fan":
        if (a.watts >= 50) add(a, "bldc", {
          title: `Swap ${a.name} for 28 W BLDC fans`,
          why: `A BLDC fan gives comparable airflow at about 28 W versus ${a.watts} W.`,
          kwh: a.qty * (a.watts - 28) * a.hours * DAYS / 1000,
          upfront: 3000 * a.qty, effort: "invest"
        });
        break;
      case "bulb":
      case "cfl":
        if (a.watts > 12) add(a, "led", {
          title: `Replace ${a.name} with 9 W LEDs`,
          why: `An LED gives similar light at 9 W. Yours draws ${a.watts} W.`,
          kwh: a.qty * (a.watts - 9) * a.hours * DAYS / 1000,
          upfront: 90 * a.qty, effort: "small"
        });
        break;
      case "tube":
        if (a.watts > 22) add(a, "led", {
          title: `Replace ${a.name} with 18 W LED battens`,
          why: `An 18 W LED batten replaces a ${a.watts} W tube with similar light.`,
          kwh: a.qty * (a.watts - 18) * a.hours * DAYS / 1000,
          upfront: 350 * a.qty, effort: "small"
        });
        break;
      case "fridge":
        add(a, "tune", {
          title: `Tune ${a.name}`,
          why: "Use a middle thermostat setting, maintain door seals, and keep space behind the coils.",
          kwh: b * 0.08, upfront: 0, effort: "free"
        });
        if (a.watts >= 180) add(a, "replace", {
          title: `Replace ${a.name} with a 5-star model`,
          why: `A 5-star model is estimated to use about 40% less than this ${a.watts} W unit.`,
          kwh: b * 0.4, upfront: 30000 * a.qty, effort: "invest"
        });
        break;
      case "heater":
        add(a, "timer", {
          title: `Put ${a.name} on a timer at 50 °C`,
          why: "Heat water only when needed and hold the thermostat near 50 °C.",
          kwh: b * 0.2, upfront: 600, effort: "small"
        });
        if (b >= 30) add(a, "solar", {
          title: "Add a solar water heater",
          why: "A solar water heater can cover much of hot-water demand in sunny weather.",
          kwh: b * 0.8 * 0.7, upfront: 25000, effort: "invest"
        });
        break;
      case "tv":
        add(a, "eco", {
          title: `Use eco picture mode on ${a.name}`,
          why: "Lower brightness and eco mode can reduce screen power and standby draw.",
          kwh: b * 0.15, upfront: 0, effort: "free"
        });
        break;
      case "pc":
        add(a, "sleep", {
          title: `Enable sleep on ${a.name}`,
          why: "Sleep after 10 idle minutes and shut down when you leave the desk.",
          kwh: b * 0.2, upfront: 0, effort: "free"
        });
        break;
      case "washer":
        add(a, "cold", {
          title: "Wash full loads in cold water",
          why: "Full loads and cold cycles can reduce motor and heater time.",
          kwh: b * 0.15, upfront: 0, effort: "free"
        });
        break;
      case "pump":
        add(a, "float", {
          title: `Fit a float switch or timer on ${a.name}`,
          why: "The pump stops when the tank is full, reducing unnecessary run time.",
          kwh: b * 0.15, upfront: 1500, effort: "small"
        });
        break;
      case "standby":
        if (a.hours >= 20) add(a, "night", {
          title: "Switch off always-on devices at night",
          why: "A switched power strip or smart plug can remove about 8 hours of idle draw daily.",
          kwh: a.qty * a.watts * 8 * DAYS / 1000,
          upfront: 400, effort: "small"
        });
        break;
    }
  });

  return recs.sort((x, y) => (x.payback - y.payback) || (y.kwh - x.kwh));
}

function findings(c, settings) {
  const out = [];
  if (!c.total) return ["Add at least one appliance and the agent will start its analysis."];

  const top = c.rows.slice().sort((x, y) => y.kwh - x.kwh)[0];
  const share = top.kwh / c.total * 100;
  if (share >= 35) out.push(`${top.a.name} uses ${Math.round(share)}% of your electricity. Fixing it has the largest impact.`);

  if (settings.bill > 0) {
    const diff = (settings.bill - c.total) / c.total * 100;
    if (diff > 15) out.push(`Your latest bill (${Math.round(settings.bill)} kWh) is ${Math.round(settings.bill - c.total)} kWh above the modeled loads. Check for unlisted appliances.`);
    else if (diff < -15) out.push(`The modeled appliances use about ${Math.round(c.total - settings.bill)} kWh more than your latest bill. Some run times may be shorter.`);
    else out.push("The model is within 15% of your latest bill, so the baseline is reasonably aligned.");
  }

  return out;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "Energy Optimization Agent API",
      endpoint: "/api/analyze",
      method: "POST"
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const settings = {
      tariff: num(body.tariff),
      ef: num(body.ef),
      setpoint: num(body.setpoint),
      bill: num(body.bill),
      target: Math.min(90, num(body.target))
    };

    const analysis = compute(items, settings.tariff, settings.ef);
    const recommendations = buildRecs(items, settings);

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        monthlyKwh: analysis.total,
        monthlyCost: analysis.cost,
        monthlyCo2Kg: analysis.co2,
        dailyKwh: analysis.total / DAYS
      },
      recommendations,
      findings: findings(analysis, settings),
      targetKwh: analysis.total * settings.target / 100,
      treeEquivalentKgPerYear: analysis.co2
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: "Invalid analysis request", details: error.message });
  }
}
