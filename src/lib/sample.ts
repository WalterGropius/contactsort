// Fictional demo contacts in the shape of an iPhone export (vCard 3.0).
const people: [string, string, string, string?, string?, string?][] = [
  // given, family, phone, org/title, email, note
  ['Ava', 'Lindqvist', '+46 70 123 45 67', 'Northwind Studio;Creative Director', 'ava@northwind.example'],
  ['Mateo', 'Alvarez', '+34 612 345 678', undefined, 'mateo.alvarez@example.com', 'Met at the climbing gym. Owes me a coffee.'],
  ['Priya', 'Raman', '+44 7700 900123', 'Helix Bio;Research Lead', 'priya@helix.example'],
  ['Jonas', 'Becker', '+49 151 2345 6789', undefined, undefined, 'Cousin (mum’s side)'],
  ['Chloé', 'Martin', '+33 6 12 34 56 78', 'Atelier Martin', 'chloe@ateliermartin.example'],
  ['Kenji', 'Watanabe', '+81 90 1234 5678', 'Kumo Labs;CTO', 'kenji@kumo.example'],
  ['Grace', 'Okafor', '+234 803 123 4567', undefined, 'grace.okafor@example.com'],
  ['Liam', 'O’Brien', '+353 85 123 4567', 'Plumbing & Heating', undefined, 'Fixed the boiler in 2023'],
  ['Sofia', 'Rossi', '+39 347 123 4567', undefined, 'sofia.rossi@example.com', 'University roommate'],
  ['Noah', 'Fischer', '+41 79 123 45 67', 'Fischer Law;Partner', 'noah@fischerlaw.example'],
  ['Amara', 'Diallo', '+221 77 123 45 67', undefined, undefined],
  ['Ethan', 'Walker', '+1 415 555 0142', 'Brightline;Account Manager', 'ethan.walker@brightline.example'],
  ['Mia', 'Novak', '+420 601 234 567', undefined, 'mia.novak@example.com', 'Book club'],
  ['Lucas', 'Silva', '+55 11 91234 5678', 'Dentist', undefined],
  ['Hannah', 'Schmidt', '+49 160 9876 5432', undefined, 'hannah.s@example.com', 'Neighbour, flat 4B'],
  ['Omar', 'Haddad', '+961 3 123 456', 'Cedar Imports;Owner', 'omar@cedar.example'],
  ['Isla', 'MacLeod', '+44 7700 900456', undefined, undefined, 'Wedding photographer — highly recommend'],
  ['Ravi', 'Kapoor', '+91 98765 43210', 'Kapoor & Sons;Accountant', 'ravi@kapoor.example'],
  ['Elena', 'Popescu', '+40 721 234 567', undefined, 'elena.p@example.com'],
  ['Tom', 'Nguyen', '+61 412 345 678', undefined, undefined, 'Surf trip 2022'],
  ['Zoe', 'Adams', '+1 212 555 0199', 'Adams Realty;Agent', 'zoe@adamsrealty.example'],
  ['Felix', 'Wagner', '+43 664 1234567', undefined, 'felix.wagner@example.com'],
  ['Yara', 'Costa', '+351 912 345 678', 'Costa Yoga', 'yara@costayoga.example'],
  ['Pizza', 'Napoli', '+39 081 123 4567', undefined, undefined, 'Best margherita in town'],
];

export const SAMPLE_VCF = people
  .map(([given, family, tel, org, email, note], i) => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//Apple Inc.//iPhone OS 18.0//EN',
      `N:${family};${given};;;`,
      `FN:${given} ${family}`,
    ];
    if (org) {
      const [company, title] = org.split(';');
      lines.push(`ORG:${company};`);
      if (title) lines.push(`TITLE:${title}`);
    }
    lines.push(`TEL;type=CELL;type=VOICE;type=pref:${tel}`);
    if (email) lines.push(`item1.EMAIL;type=INTERNET;type=pref:${email}`, 'item1.X-ABLabel:_$!<Other>!$_');
    if (i % 5 === 0) lines.push(`BDAY:${1980 + i}-0${(i % 9) + 1}-1${i % 10}`);
    if (note) lines.push(`NOTE:${note.replace(/,/g, '\\,')}`);
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  })
  .join('');
