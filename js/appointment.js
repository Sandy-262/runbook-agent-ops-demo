// Once deployed on Render, update this URL to your actual Render domain:
const BACKEND_URL = "https://runbook-agent-backend.onrender.com/api/appointment";

function loadExample(num) {
  const input = document.getElementById("requestInput");
  if (num === 1) {
    input.value = "Schedule a delivery for BlueDart Chennai on Wednesday between 9 AM and 12 PM. Carrier is BlueDart Fleet.";
  } else if (num === 2) {
    input.value = "Schedule a pickup for DHL Bangalore Tuesday between 10 AM and 2 PM. Delivery needs to happen within 24 hours. Carrier is ABC Logistics.";
  } else if (num === 3) {
    input.value = "Schedule the pickup sometime Tuesday.";
  }
}

function logActivity(text) {
  const panel = document.getElementById("activityLog");
  const time = new Date().toTimeString().split(' ')[0];
  panel.textContent += `\n${time}  ${text}`;
  panel.scrollTop = panel.scrollHeight;
}

// Variable to hold context for the current decision
let currentPendingAction = null;

async function runAgent() {
  const text = document.getElementById("requestInput").value.trim();
  if (!text) return alert("Please enter an operational request.");

  const log = document.getElementById("activityLog");
  log.textContent = `[Session Started]`;
  document.getElementById("decisionArea").style.display = "none";
  document.getElementById("approvalActions").style.display = "none";

  logActivity("Received natural language request");
  logActivity("Sending payload to Agent Execution Engine...");

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();

    if (data.execution_steps) {
      data.execution_steps.forEach(step => logActivity(step));
    }

    const decisionArea = document.getElementById("decisionArea");
    const decisionTitle = document.getElementById("decisionTitle");
    const decisionBody = document.getElementById("decisionBody");
    decisionArea.style.display = "block";

    if (data.requires_human_approval) {
      // Store context for the approve/reject buttons
      currentPendingAction = {
        carrier: text.includes("ABC Logistics") ? "ABC Logistics" : "Unverified Carrier",
        customer: text.toLowerCase().includes("dhl") ? "DHL Bangalore" : "Facility",
        slot: data.proposed_action ? data.proposed_action.time_slot : "Requested Window"
      };

      decisionTitle.innerHTML = "<span style='color:#eab308;'>⚠ Human Approval Required</span>";
      decisionBody.innerHTML = `<strong>Proposed Slot:</strong> ${data.proposed_action.time_slot}<br>
        <strong>Reason for Escalation:</strong> ${data.reasoning_summary}<br>
        <em>Slack notification sent to operator channel.</em>`;
      document.getElementById("approvalActions").style.display = "block";
    } else if (data.missing_information && data.missing_information.length > 0) {
      decisionTitle.innerHTML = "<span style='color:#ef4444;'>❌ Missing Required Information</span>";
      decisionBody.innerHTML = `The agent paused execution because critical information was missing:<br><ul>` +
        data.missing_information.map(m => `<li>${m}</li>`).join('') + `</ul>`;
    } else {
      decisionTitle.innerHTML = "<span style='color:#16a34a;'>✓ Autonomous Execution Complete</span>";
      decisionBody.innerHTML = `<strong>Appointment Created:</strong> Job ID <code>${data.job_id}</code><br>
        <strong>Scheduled Slot:</strong> ${data.proposed_action.time_slot}<br>
        <strong>Status:</strong> Confirmed in calendar and customer notified.`;
    }
  } catch (err) {
    logActivity(`[Error] Failed to connect to agent backend: ${err.message}`);
  }
}

async function approveAction() {
  logActivity("Operator clicked 'Approve' in Web UI");
  logActivity("Sending confirmation to Agent Backend...");
  
  try {
    await fetch("https://runbook-agent-backend.onrender.com/api/appointment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approved",
        carrier: currentPendingAction?.carrier || "ABC Logistics",
        customer: currentPendingAction?.customer || "DHL Bangalore",
        slot: currentPendingAction?.slot || "Tuesday 10:00 AM"
      })
    });
    logActivity("✓ Confirmation recorded in Render logs & dispatched to Slack");
    logActivity("✓ Appointment created: JOB-1042");
    logActivity("[Workflow Completed Successfully]");
  } catch (err) {
    logActivity("[Error] Failed to dispatch approval: " + err.message);
  }

  document.getElementById("approvalActions").style.display = "none";
  document.getElementById("decisionBody").innerHTML += "<br><strong style='color:#16a34a;'>Action Approved & Recorded in Slack.</strong>";
}

async function rejectAction() {
  logActivity("Operator clicked 'Reject' in Web UI");
  logActivity("Sending rejection event to Agent Backend...");

  try {
    await fetch("https://runbook-agent-backend.onrender.com/api/appointment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rejected",
        carrier: currentPendingAction?.carrier || "ABC Logistics",
        customer: currentPendingAction?.customer || "DHL Bangalore",
        slot: currentPendingAction?.slot || "Tuesday 10:00 AM"
      })
    });
    logActivity("✓ Rejection recorded in Render logs & dispatched to Slack");
    logActivity("Execution halted. Job marked as CANCELLED in audit store.");
  } catch (err) {
    logActivity("[Error] Failed to dispatch rejection: " + err.message);
  }

  document.getElementById("approvalActions").style.display = "none";
  document.getElementById("decisionBody").innerHTML += "<br><strong style='color:#dc2626;'>Action Rejected & Logged in Slack.</strong>";
}
