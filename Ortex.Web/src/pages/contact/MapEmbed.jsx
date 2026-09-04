/** Google Maps embed of the Ortex Industries factory location. */
export default function MapEmbed() {
  return (
    <div className="mt-[50px] overflow-hidden rounded-[6px]">
      <iframe
        title="Ortex Industries location on Google Maps"
        src="https://www.google.com/maps?q=RZ-4%20Mahindra%20Park%2C%20Uttam%20Nagar%2C%20West%20Delhi%2C%20New%20Delhi%2C%20Delhi%20110059%2C%20India&output=embed"
        className="w-full h-[300px] border-0 block"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  )
}
