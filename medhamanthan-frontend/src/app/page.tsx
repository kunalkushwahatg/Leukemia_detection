"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Upload, FileImage, AlertCircle, CheckCircle, Loader2, Wifi, WifiOff, Clock, Mail, User } from "lucide-react"

interface PredictionResult {
  prediction: string
  confidence: number
  probabilities?: Record<string, number>
}

interface PatientInfo {
  name: string
  age: string
  gender: string
  phone: string
  email: string
}

type ApiStatus = "online" | "offline" | "checking"
type AppStep = "patient-info" | "image-upload" | "results"

export default function LeukemiaClassifier() {
  const [currentStep, setCurrentStep] = useState<AppStep>("patient-info")
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: "",
    age: "",
    gender: "",
    phone: "",
    email: "",
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking")
  const [timeRemaining, setTimeRemaining] = useState<number>(0)
  const [sendingReport, setSendingReport] = useState<boolean>(false)
  const [reportSent, setReportSent] = useState<boolean>(false)
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const API_BASE_URL = "http://localhost:8000"

  // Check API health on component mount
  useEffect(() => {
    checkApiHealth()
  }, [])

  // Timer effect
  useEffect(() => {
    if (timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1)
      }, 1000)
    } else if (timeRemaining === 0 && currentStep === "results" && prediction) {
      // Auto reset after 5 minutes
      handleReset()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [timeRemaining, currentStep, prediction])

  const checkApiHealth = async (): Promise<void> => {
    try {
      setApiStatus("checking")
      console.log("Checking API health at:", `${API_BASE_URL}/`)

      const response = await fetch(`${API_BASE_URL}/`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        mode: "cors",
      })

      console.log("API response status:", response.status)
      console.log("API response ok:", response.ok)

      if (response.ok) {
        setApiStatus("online")
        console.log("API is online")
      } else {
        setApiStatus("offline")
        console.log("API returned non-ok status:", response.status)
      }
    } catch (err) {
      setApiStatus("offline")
      console.error("API health check failed:", err)

      if (err instanceof TypeError && err.message.includes("fetch")) {
        console.error("Network error - possibly CORS issue or API not accessible")
      }
    }
  }

  const handlePatientInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (patientInfo.name && patientInfo.age && patientInfo.gender && patientInfo.phone && patientInfo.email) {
      setCurrentStep("image-upload")
      setError(null)
    } else {
      setError("Please fill in all patient information fields")
    }
  }

  const handlePatientInfoChange = (field: keyof PatientInfo, value: string) => {
    setPatientInfo((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes: string[] = ["image/bmp", "image/jpeg", "image/png"]
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a valid image file (.bmp, .jpeg, or .png)")
      return
    }

    setSelectedFile(file)
    setError(null)
    setPrediction(null)

    const reader = new FileReader()
    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target?.result) {
        setPreview(e.target.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async (): Promise<void> => {
    if (!selectedFile) {
      setError("Please select a file first")
      return
    }

    setLoading(true)
    setError(null)
    setPrediction(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorMessage
        } catch (parseError) {
          errorMessage = response.statusText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const result: PredictionResult = await response.json()
      setPrediction(result)
      setCurrentStep("results")
      setTimeRemaining(300) // 5 minutes = 300 seconds
      setReportSent(false)
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
          setError("Failed to connect to the server. Make sure the API is running on localhost:8000")
        } else {
          setError(`Prediction failed: ${err.message}`)
        }
      } else {
        setError("An unknown error occurred")
      }
      console.error("Upload error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendReport = async () => {
    if (!prediction || !patientInfo.email) return

    setSendingReport(true)
    try {
      const response = await fetch("/api/send-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientInfo,
          prediction,
          imageData: preview,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to send report")
      }

      setReportSent(true)
    } catch (err) {
      setError("Failed to send report. Please try again.")
      console.error("Send report error:", err)
    } finally {
      setSendingReport(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!prediction) return

    setGeneratingPdf(true)
    try {
      // Dynamic import to avoid SSR issues
      const { jsPDF } = await import("jspdf")

      // Create PDF report
      const pdf = new jsPDF()

      // Add header
      pdf.setFontSize(20)
      pdf.setTextColor(37, 99, 235) // Blue color
      pdf.text("Leukemia Classification Report", 20, 30)

      // Add a line under header
      pdf.setDrawColor(37, 99, 235)
      pdf.setLineWidth(0.5)
      pdf.line(20, 35, 190, 35)

      // Add patient information section
      pdf.setFontSize(16)
      pdf.setTextColor(0, 0, 0)
      pdf.text("Patient Information", 20, 55)

      pdf.setFontSize(12)
      pdf.text(`Name: ${patientInfo.name}`, 25, 70)
      pdf.text(`Age: ${patientInfo.age} years`, 25, 80)
      pdf.text(`Gender: ${patientInfo.gender.charAt(0).toUpperCase() + patientInfo.gender.slice(1)}`, 25, 90)
      pdf.text(`Phone: ${patientInfo.phone}`, 25, 100)
      pdf.text(`Email: ${patientInfo.email}`, 25, 110)

      // Add analysis results section
      pdf.setFontSize(16)
      pdf.text("Analysis Results", 20, 135)

      pdf.setFontSize(12)
      const classificationColor: [number, number, number] =
        prediction.prediction.toLowerCase() === "leukemia" ? [220, 38, 38] : [22, 163, 74]
      pdf.setTextColor(...classificationColor)
      pdf.text(`Classification: ${prediction.prediction}`, 25, 150)

      pdf.setTextColor(0, 0, 0)
      pdf.text(`Confidence Level: ${(prediction.confidence * 100).toFixed(1)}%`, 25, 160)

      // Add interpretation
      pdf.setFontSize(10)
      pdf.text(
        `Interpretation: ${prediction.prediction === "Leukemia" ? "Acute Lymphoblastic Leukemia detected" : "No leukemia detected - Healthy cells"}`,
        25,
        170,
      )

      // Add probabilities if available
      if (prediction.probabilities) {
        pdf.setFontSize(14)
        pdf.text("Detailed Probabilities", 20, 190)

        pdf.setFontSize(11)
        let yPos = 205
        Object.entries(prediction.probabilities).forEach(([className, prob]) => {
          pdf.text(`• ${className}: ${(prob * 100).toFixed(2)}%`, 25, yPos)
          yPos += 12
        })
      }

      // Add timestamp and system info
      const currentDate = new Date()
      pdf.setFontSize(10)
      pdf.setTextColor(107, 114, 128)
      pdf.text(`Report Generated: ${currentDate.toLocaleDateString()} at ${currentDate.toLocaleTimeString()}`, 20, 260)
      pdf.text("Generated by:Leukemia Classification System", 20, 270)

      // Add disclaimer box
      pdf.setDrawColor(239, 68, 68)
      pdf.setFillColor(254, 242, 242)
      pdf.rect(20, 280, 170, 25, "FD")

      pdf.setFontSize(9)
      pdf.setTextColor(153, 27, 27)
      pdf.text("IMPORTANT DISCLAIMER:", 25, 290)
      pdf.text("This report should be reviewed by a qualified", 25, 298)
      pdf.text("medical professional. Please consult with your healthcare provider for", 25, 304)

      // Generate filename
      const filename = `leukemia-report-${patientInfo.name.replace(/\s+/g, "-").toLowerCase()}-${currentDate.toISOString().split("T")[0]}.pdf`

      // Download the PDF
      pdf.save(filename)
    } catch (error) {
      setError("Failed to generate PDF. Please try again.")
      console.error("PDF generation error:", error)
    } finally {
      setGeneratingPdf(false)
    }
  }

  const handleReset = (): void => {
    setCurrentStep("patient-info")
    setPatientInfo({
      name: "",
      age: "",
      gender: "",
      phone: "",
      email: "",
    })
    setSelectedFile(null)
    setPreview(null)
    setPrediction(null)
    setError(null)
    setTimeRemaining(0)
    setReportSent(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }

  const getPredictionColor = (prediction: PredictionResult | null): string => {
    if (!prediction) return "text-gray-600"
    const predicted = prediction.prediction?.toLowerCase()
    return predicted === "leukemia" ? "text-red-600" : "text-green-600"
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return "text-green-600"
    if (confidence >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <h1 className="text-4xl font-bold text-gray-800">Leukemia Classification</h1>
            <div className="flex items-center space-x-1">
              {apiStatus === "online" && <Wifi className="h-5 w-5 text-green-500" />}
              {apiStatus === "offline" && <WifiOff className="h-5 w-5 text-red-500" />}
              {apiStatus === "checking" && <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />}
            </div>
          </div>
          <p className="text-lg text-gray-600">leukemia detection system</p>
          <div className="mt-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                apiStatus === "online"
                  ? "bg-green-100 text-green-800"
                  : apiStatus === "offline"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
              }`}
            >
              API Status: {apiStatus === "checking" ? "Checking..." : apiStatus.toUpperCase()}
            </span>
            {apiStatus === "offline" && (
              <button onClick={checkApiHealth} className="ml-2 text-sm text-blue-600 hover:text-blue-800">
                Retry Connection
              </button>
            )}
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                currentStep === "patient-info" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              <User className="h-4 w-4" />
              <span className="text-sm font-medium">Patient Info</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                currentStep === "image-upload" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              <FileImage className="h-4 w-4" />
              <span className="text-sm font-medium">Image Upload</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
                currentStep === "results" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Results</span>
            </div>
          </div>
        </div>

        {/* Patient Information Form */}
        {currentStep === "patient-info" && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
              <User className="h-6 w-6 mr-2" />
              Patient Information
            </h2>
            <form onSubmit={handlePatientInfoSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                  <input
                    type="text"
                    value={patientInfo.name}
                    onChange={(e) => handlePatientInfoChange("name", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter patient's full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Age *</label>
                  <input
                    type="number"
                    value={patientInfo.age}
                    onChange={(e) => handlePatientInfoChange("age", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter age"
                    min="1"
                    max="120"
                    required
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender *</label>
                  <select
                    value={patientInfo.gender}
                    onChange={(e) => handlePatientInfoChange("gender", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                  <input
                    type="tel"
                    value={patientInfo.phone}
                    onChange={(e) => handlePatientInfoChange("phone", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter phone number"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                <input
                  type="email"
                  value={patientInfo.email}
                  onChange={(e) => handlePatientInfoChange("email", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter email address"
                  required
                />
              </div>
              {error && (
                <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                  </div>
                </div>
              )}
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Continue to Image Upload
              </button>
            </form>
          </div>
        )}

        {/* Image Upload Section */}
        {currentStep === "image-upload" && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                <FileImage className="h-6 w-6 mr-2" />
                Upload Microscopic Image
              </h2>
              <button
                onClick={() => setCurrentStep("patient-info")}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Edit Patient Info
              </button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".bmp,.jpeg,.jpg,.png"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">Click to upload microscopic image</p>
                <p className="text-sm text-gray-500">Supports BMP, JPEG, and PNG files</p>
              </label>
            </div>

            {selectedFile && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2">
                  <FileImage className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                  <span className="text-sm text-gray-500">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              </div>
            )}

            <div className="flex space-x-4 mt-6">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || loading || apiStatus !== "online"}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>{apiStatus === "offline" ? "API Offline" : "Analyze Image"}</span>
                )}
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>

            {error && (
              <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg mt-4">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Section */}
        {currentStep === "results" && (
          <>
            {/* Timer Display */}
            {timeRemaining > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center space-x-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <span className="text-yellow-800 font-medium">Auto-reset in: {formatTime(timeRemaining)}</span>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {preview && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">Image Preview</h3>
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img src={preview || "/placeholder.svg"} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              {prediction && (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Analysis Results</h3>
                    {timeRemaining > 0 && (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSendReport}
                          disabled={sendingReport || reportSent}
                          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {sendingReport ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : reportSent ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              <span>Sent</span>
                            </>
                          ) : (
                            <>
                              <Mail className="h-8 w-8" />
                              <span>Email Report</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleDownloadPdf}
                          disabled={generatingPdf}
                          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          {generatingPdf ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <FileImage className="h-8 w-8" />
                              <span>Download PDF</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-green-800">Analysis Complete</p>
                        <p className="text-sm text-green-600 mt-1">Image processed successfully</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Classification</p>
                        <p className={`text-lg font-semibold ${getPredictionColor(prediction)}`}>
                          {prediction.prediction}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {prediction.prediction === "Leukemia" ? "Acute Lymphoblastic Leukemia" : "Healthy"}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Confidence</p>
                        <p className={`text-lg font-semibold ${getConfidenceColor(prediction.confidence)}`}>
                          {prediction.confidence ? `${(prediction.confidence * 100).toFixed(1)}%` : "N/A"}
                        </p>
                      </div>
                    </div>

                    {prediction.probabilities && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600 mb-3">Class Probabilities</p>
                        <div className="space-y-2">
                          {Object.entries(prediction.probabilities).map(([className, prob]) => (
                            <div key={className} className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">{className}</span>
                              <div className="flex items-center space-x-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${prob * 100}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-600 w-12 text-right">
                                  {(prob * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {reportSent && (
                      <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <Mail className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-blue-800">Report Sent</p>
                          <p className="text-sm text-blue-600 mt-1">PDF report has been sent to {patientInfo.email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={handleReset}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Start New Analysis
              </button>
            </div>
          </>
        )}

        {error && currentStep !== "patient-info" && currentStep !== "image-upload" && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
