import { Check } from "../../components/ui/Icons"

export default function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center mb-10 gap-3">
      {[{ n: 1, label: "Build quote" }, { n: 2, label: "Your details" }].map((s, i) => (
        <div key={s.n} className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
              step === s.n ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                : step > s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={`text-sm font-medium ${step === s.n ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
          </div>
          {i === 0 && <div className={`h-0.5 w-8 md:w-16 rounded ${step > 1 ? "bg-primary" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  )
}
