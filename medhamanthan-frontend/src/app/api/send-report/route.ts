import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { jsPDF } from "jspdf"

interface PatientInfo {
  name: string
  age: string
  gender: string
  phone: string
  email: string
}

interface PredictionResult {
  prediction: string
  confidence: number
  probabilities?: Record<string, number>
}

export async function POST(request: NextRequest) {
  try {
    const {
      patientInfo,
      prediction,
      imageData,
    }: {
      patientInfo: PatientInfo
      prediction: PredictionResult
      imageData: string
    } = await request.json()

    // Validate required data
    if (!patientInfo || !prediction) {
      return NextResponse.json(
        { success: false, error: "Missing required patient information or prediction data" },
        { status: 400 },
      )
    }

    if (!patientInfo.email) {
      return NextResponse.json({ success: false, error: "Patient email is required" }, { status: 400 })
    }

    // Create PDF report with null checks
    const pdf = new jsPDF()

    // Add header
    pdf.setFontSize(20)
    pdf.text("Leukemia Classification Report", 20, 30)

    // Add patient information with null checks
    pdf.setFontSize(14)
    pdf.text("Patient Information:", 20, 50)
    pdf.setFontSize(12)
    pdf.text(`Name: ${patientInfo.name || "N/A"}`, 20, 65)
    pdf.text(`Age: ${patientInfo.age || "N/A"}`, 20, 75)
    pdf.text(`Gender: ${patientInfo.gender || "N/A"}`, 20, 85)
    pdf.text(`Phone: ${patientInfo.phone || "N/A"}`, 20, 95)
    pdf.text(`Email: ${patientInfo.email || "N/A"}`, 20, 105)

    // Add analysis results with null checks
    pdf.setFontSize(14)
    pdf.text("Analysis Results:", 20, 125)
    pdf.setFontSize(12)
    pdf.text(`Classification: ${prediction.prediction || "Unknown"}`, 20, 140)
    pdf.text(`Confidence: ${prediction.confidence ? (prediction.confidence * 100).toFixed(1) + "%" : "N/A"}`, 20, 150)

    // Add probabilities if available
    if (prediction.probabilities && Object.keys(prediction.probabilities).length > 0) {
      pdf.text("Class Probabilities:", 20, 170)
      let yPos = 180
      Object.entries(prediction.probabilities).forEach(([className, prob]) => {
        pdf.text(`${className}: ${(prob * 100).toFixed(1)}%`, 30, yPos)
        yPos += 10
      })
    }

    // Add timestamp
    pdf.text(`Report generated on: ${new Date().toLocaleString()}`, 20, 250)

    // Add disclaimer
    pdf.setFontSize(10)
    pdf.text("This report should be reviewed by a medical professional.", 20, 270)

    // Convert PDF to buffer
    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"))

    // Create email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user:"hrushikeshsarangi7@gmail.com",
        pass:"slse vnqw dodi pilt", // Use App Password, not regular password
      },
    })

    // Email options
    const mailOptions = {
      from:"hrushikeshsarangi7@gmail.com",
      to: patientInfo.email,
      subject: `Leukemia Classification Report - ${patientInfo.name}`,
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Leukemia Classification Report</h2>
      
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #374151; margin-top: 0;">Patient Information</h3>
        <p><strong>Name:</strong> ${patientInfo.name || "N/A"}</p>
        <p><strong>Age:</strong> ${patientInfo.age || "N/A"}</p>
        <p><strong>Gender:</strong> ${patientInfo.gender || "N/A"}</p>
        <p><strong>Phone:</strong> ${patientInfo.phone || "N/A"}</p>
      </div>
      
      <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #374151; margin-top: 0;">Analysis Results</h3>
        <p><strong>Classification:</strong> <span style="color: ${
          prediction.prediction && prediction.prediction.toLowerCase() === "leukemia" ? "#dc2626" : "#16a34a"
        };">${prediction.prediction || "Unknown"}</span></p>
        <p><strong>Confidence:</strong> ${
          prediction.confidence ? (prediction.confidence * 100).toFixed(1) + "%" : "N/A"
        }</p>
        ${
          prediction.probabilities
            ? `
          <h4>Class Probabilities:</h4>
          <ul>
            ${Object.entries(prediction.probabilities)
              .map(([className, prob]) => `<li>${className}: ${(prob * 100).toFixed(1)}%</li>`)
              .join("")}
          </ul>
        `
            : ""
        }
      </div>
      
      <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>Important:</strong> This report should be reviewed by a qualified medical professional. Please consult with your healthcare provider for proper medical advice.
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 12px;">
        Report generated on: ${new Date().toLocaleString()}<br>
        Leukemia Classification System
      </p>
    </div>
  `,
      attachments: [
        {
          filename: `leukemia-report-${(patientInfo.name || "patient").replace(/\s+/g, "-").toLowerCase()}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    }

    // Send email
    await transporter.sendMail(mailOptions)

    return NextResponse.json({ success: true, message: "Report sent successfully" })
  } catch (error) {
    console.error("Error sending report:", error)
    return NextResponse.json({ success: false, error: "Failed to send report" }, { status: 500 })
  }
}
