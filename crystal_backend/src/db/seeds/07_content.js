/**
 * The published side of the catalogue: artwork, OS releases and the blog.
 *
 * Seeds 01-06 build the things the business RUNS on - products, stock,
 * tickets, members.  Nothing in them gives the customer website anything to
 * look at beyond a single cover image per product, so the gallery is empty,
 * `/support/os` answers `[]` and the blog has no posts at all.  Three screens
 * of the spec render as empty states on a database that is otherwise full.
 *
 * The file paths written here do not have to exist yet: `npm run mock:images`
 * reads every /uploads/... path out of these same tables and writes an SVG
 * placeholder for the ones with no file behind them.  So a path invented here
 * becomes artwork there, and the two stay in step because only one of them
 * decides what the paths are.
 */

/** Deterministic, so the same seed always produces the same database. */
function rng(seed) {
  let state = seed;
  return function next(max) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % max;
  };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function stampDaysAgo(days) {
  return new Date(Date.now() - days * 86400000);
}

/**
 * Crystal OS, oldest first.
 *
 * `highlights` is newline separated because that is what the console's editor
 * writes - the field is labelled "Highlights (one per line)" - and a seed that
 * stored JSON here would look right on the website and then be destroyed the
 * first time somebody opened the row in the admin and pressed save.
 *
 * The rollout is staged rather than simultaneous: which handset got which
 * version, and when, is the whole point of product_os_history below, and a
 * catalogue where every device jumped to the newest build on the same day
 * cannot exercise it.
 */
const OS_VERSIONS = [
  {
    version: '4.4',
    title: 'Crystal OS 4.4',
    release_date: isoDaysAgo(690),
    description:
      'The last of the 4.x line, and the build most of the older estate is still on. ' +
      'Maintenance only from here: security patches continue, features do not.',
    highlights: [
      'Security patches through to the end of the support window',
      'Battery health reporting on the C5 and C7 lines',
      'Faster cold start for the camera app'
    ].join('\n'),
    cover_image: '/uploads/os/crystal-os-4-4.svg'
  },
  {
    version: '5.0',
    title: 'Crystal OS 5.0',
    release_date: isoDaysAgo(430),
    description:
      'The rebuilt interface, and the first release to ship the repairability ' +
      'panel that tells an owner which parts of their device are field serviceable.',
    highlights: [
      'Redesigned home screen and control centre',
      'Repairability panel: part-by-part service status',
      'Device health export for authorised service centres',
      'Sixteen months of security updates from this build'
    ].join('\n'),
    cover_image: '/uploads/os/crystal-os-5-0.svg'
  },
  {
    version: '5.1',
    title: 'Crystal OS 5.1',
    release_date: isoDaysAgo(250),
    description:
      'A tightening release. Nothing moved on screen; a great deal moved underneath it.',
    highlights: [
      'Roughly a fifth less background power draw on the C9 line',
      'Bluetooth audio reconnects without dropping the first second',
      'Warranty status readable from Settings, offline'
    ].join('\n'),
    cover_image: '/uploads/os/crystal-os-5-1.svg'
  },
  {
    version: '5.2',
    title: 'Crystal OS 5.2',
    release_date: isoDaysAgo(96),
    description:
      'Current. Shipping on new devices and rolled out to every handset from the ' +
      'C5 upwards, with the television line following a month behind.',
    highlights: [
      'On-device photo search, with nothing leaving the handset',
      'Service booking from Settings, straight into the repair queue',
      'Parts provenance: the panel now names which centre fitted a replacement',
      'Two additional years of security updates'
    ].join('\n'),
    cover_image: '/uploads/os/crystal-os-5-2.svg'
  },
  {
    version: '6.0',
    title: 'Crystal OS 6.0 preview',
    release_date: isoDaysAgo(12),
    /*
     * Deliberately not PUBLISHED.  The storefront filters on status and the
     * console does not, so an unpublished row is the only way to prove that
     * the two disagree on purpose - the same thing the `an unpublished
     * product is not reachable by guessing its slug` check does for products.
     */
    status: 'DRAFT',
    description:
      'In test with service centres. Not for customer devices, and not listed publicly.',
    highlights: [
      'Diagnostics rewritten around the symptom catalogue',
      'Technician mode: read a device health report over USB-C'
    ].join('\n'),
    cover_image: '/uploads/os/crystal-os-6-0.svg'
  }
];

/**
 * The blog.
 *
 * Written around what this business actually is - repairability, service
 * centres, parts - rather than as filler, because the landing page pulls the
 * three most recent posts and a row of lorem ipsum on the front page is how a
 * demo stops being demonstrable.
 *
 * Categories are a free text column, and these five are the ones the category
 * chips on /blog will therefore offer.
 */
const ARTICLES = [
  {
    title: 'Why every Crystal device ships with a parts list',
    category: 'REPAIRABILITY',
    days: 6,
    featured: true,
    summary:
      'Ten years of spares, a published price for each of them, and a screwdriver ' +
      'that fits. The argument for building it that way.',
    content:
      'A device that cannot be opened is a device with an expiry date. We have taken ' +
      'the opposite position from the first Crystal handset: every part that can ' +
      'reasonably fail is a part you can buy, and the price is published before you ' +
      'need it.\n\n' +
      'That commitment is not free. It constrains the industrial design - adhesive is ' +
      'cheaper and thinner than fasteners - and it means holding inventory for a decade ' +
      'against demand that falls every year. We think the trade is worth making.\n\n' +
      'The repairability panel in Crystal OS 5.0 made the position legible on the device ' +
      'itself. Open Settings and you can see, part by part, what is field serviceable, ' +
      'what needs a centre, and what a replacement costs. No account, no network call.'
  },
  {
    title: 'Inside a Crystal service centre',
    category: 'SERVICE',
    days: 15,
    featured: true,
    summary:
      'What happens to a handset between the counter and the collection text message.',
    content:
      'A repair begins as a symptom, not a diagnosis. The technician records what the ' +
      'owner describes against the symptom catalogue, and only then opens the device.\n\n' +
      'The distinction matters for the same reason it matters in medicine: the reported ' +
      'fault and the actual fault are different things often enough that recording the ' +
      'diagnosis as the complaint loses the pattern. Grouped across the estate, those ' +
      'symptom codes are what surfaces a batch problem weeks before the returns rate ' +
      'would have shown it.\n\n' +
      'Parts are reserved before they are issued. A reservation holds stock against a ' +
      'ticket without moving it off the shelf, so a device waiting on an owner approval ' +
      'is not competing for the same screen as the one on the bench.'
  },
  {
    title: 'Crystal OS 5.2 is rolling out now',
    category: 'SOFTWARE',
    days: 24,
    featured: true,
    summary:
      'Photo search that runs on the device, service booking from Settings, and two ' +
      'more years of security updates.',
    content:
      'Crystal OS 5.2 begins its staged rollout this week, starting with the C9 line ' +
      'and reaching the C5 over the following fortnight. Televisions follow a month ' +
      'behind, as they always do - a set-top rollback is a service visit, so those ' +
      'builds get the longer soak.\n\n' +
      'The headline is photo search, and the notable thing about it is what it does not ' +
      'do: nothing is uploaded. The index is built on the device, overnight, on mains ' +
      'power.\n\n' +
      'Parts provenance is the smaller change we expect people to notice more. If a ' +
      'part in your device was replaced by an authorised centre, the panel now names ' +
      'the centre and the date.'
  },
  {
    title: 'The C9 Pro, taken apart',
    category: 'PRODUCTS',
    days: 33,
    summary: 'Eleven fasteners, no adhesive on the battery, and a screen that comes out first.',
    content:
      'The C9 Pro opens from the back, which is unusual, and it opens with a driver ' +
      'rather than heat.\n\n' +
      'The battery is held by pull tabs rather than glue. It is the single most common ' +
      'replacement across the entire estate and the one most likely to be attempted at ' +
      'a kitchen table, so it sits directly under the back cover with nothing above it.\n\n' +
      'The display assembly is a single unit including the frame. That is a more ' +
      'expensive part than a bare panel, and it is deliberate: a bare panel swap needs ' +
      'a jig and a laminator, which means it can only happen at a flagship centre.'
  },
  {
    title: 'Twelve new collection points across the network',
    category: 'SERVICE',
    days: 41,
    summary: 'Drop-off within thirty minutes of most of the country by the end of the quarter.',
    content:
      'A collection point is not a repair centre. It takes the device in, ships it to ' +
      'the centre that can fix it, and hands it back - which for most owners is the part ' +
      'of the process they actually care about.\n\n' +
      'The twelve new sites are chosen by drive time from existing coverage rather than ' +
      'by population, which is why several of them are in places with no Crystal store.'
  },
  {
    title: 'What we learned from 40,000 repairs',
    category: 'REPAIRABILITY',
    days: 58,
    summary: 'Screens, batteries, charge ports. In that order, every year, on every line.',
    content:
      'The distribution of faults is remarkably stable. Displays lead, batteries follow, ' +
      'charge ports are third, and together they are most of the workload.\n\n' +
      'What changes is the cause. Charge port failures fell sharply across the C7 ' +
      'generation, and the reason was not the port: it was wireless charging becoming ' +
      'common enough that the connector saw a fraction of the insertions.\n\n' +
      'The lesson we keep relearning is that the fix for a common failure is often ' +
      'somewhere else in the product entirely.'
  },
  {
    title: 'Crystal Vision 85 QLED: the panel and the promise',
    category: 'PRODUCTS',
    days: 70,
    summary: 'A television with a serviceable power board, because that is what fails.',
    content:
      'Televisions are thrown away for small reasons. A power board is a component that ' +
      'costs very little and, in most sets, cannot be replaced without a technician ' +
      'concluding it is not worth it.\n\n' +
      'The Vision 85 puts the power board on a single connector behind an access panel. ' +
      'It is a fifteen minute job at a collection point rather than a two hour job at a ' +
      'centre, and it is the difference between a repair and a replacement.'
  },
  {
    title: 'Extended cover, explained without the small print',
    category: 'WARRANTY',
    days: 88,
    summary: 'What Care+ adds, what it does not, and when it is not worth buying.',
    content:
      'Standard cover is against faults. It is not against damage, and no amount of ' +
      'reading the terms slowly will change that.\n\n' +
      'Care+ adds accidental damage and raises the claim limit. It is worth buying for a ' +
      'device that travels and for anything with a large piece of glass on the front of ' +
      'it. It is generally not worth buying for a set-top box that will sit in a cabinet ' +
      'for six years.\n\n' +
      'Cover can be extended at any point before the standard term ends, and the ' +
      'extension starts the day after the existing cover stops - buying early costs you ' +
      'nothing.'
  },
  {
    title: 'How we price a repair',
    category: 'SERVICE',
    days: 104,
    summary: 'Part, labour, and the reason the second number is smaller than you expect.',
    content:
      'A repair price is the part plus the labour, and both halves are published per ' +
      'product before you book.\n\n' +
      'Labour is charged in bands rather than by the minute. A technician who is fast ' +
      'should not cost you more than one who is slow, and a job that goes wrong should ' +
      'not become your problem.\n\n' +
      'Under warranty, both halves are zero and the centre claims them back from head ' +
      'office monthly. That settlement is invisible to the owner by design.'
  },
  {
    title: 'The Studio 16 comes apart in four minutes',
    category: 'PRODUCTS',
    days: 121,
    summary: 'Memory, storage and battery, all reachable without removing the board.',
    content:
      'Laptops have been getting harder to open for a decade. The Studio 16 goes the ' +
      'other way: ten captive fasteners, a back cover that lifts rather than peels, and ' +
      'the three parts most likely to need attention sitting directly underneath.\n\n' +
      'Captive is the important word. The fasteners stay in the cover, so there is ' +
      'nothing to lose on a workbench and nothing to get wrong on reassembly.'
  },
  {
    title: 'Security updates: what "supported" actually means',
    category: 'SOFTWARE',
    days: 143,
    summary: 'Dates, not adjectives. Every device has one, and it is on the box.',
    content:
      '"Long term support" means nothing without a date attached. Every Crystal device ' +
      'has a support-until date, it is printed on the box, and it is readable in ' +
      'Settings on the device itself.\n\n' +
      'Crystal OS 5.2 carries that date two years further forward on everything it ' +
      'installs onto, including handsets that shipped with 4.4.'
  },
  {
    title: 'Recycling a device we cannot repair',
    category: 'REPAIRABILITY',
    days: 168,
    summary: 'What happens when the economics stop working, and why we still take it back.',
    content:
      'Some repairs are not worth doing. Water damage across a main board is the usual ' +
      'case: the part is most of the value of the device and the outcome is uncertain ' +
      'even after it is fitted.\n\n' +
      'We take those devices back anyway. Harvestable parts go into the service stream ' +
      'as tested components, which is why a screen for a five year old handset is still ' +
      'available at a sane price.'
  },
  {
    title: 'A quieter charge port',
    category: 'PRODUCTS',
    days: 196,
    summary: 'A small change to the C5 connector, and the returns data behind it.',
    content:
      'The revised C5 charge port has a longer retention spring and a shallower ' +
      'chamfer. Neither is visible and neither was a design preference.\n\n' +
      'Both came out of a batch pattern in the defect watch: one production window, one ' +
      'factory, a charge port failure rate several times the line average. The tooling ' +
      'was corrected and the batch was extended cover automatically.'
  },
  {
    title: 'Crystal Optic R1 firmware 2.1',
    category: 'SOFTWARE',
    days: 224,
    summary: 'Focus tracking, tethered capture, and support for two more lenses.',
    content:
      'Firmware 2.1 for the Optic R1 is available now through Crystal OS or as a card ' +
      'image for offline installation.\n\n' +
      'Focus tracking has been rebuilt around subject detection rather than contrast, ' +
      'which mostly matters in poor light. Tethered capture over USB-C no longer ' +
      'requires the desktop application.'
  }
];

/**
 * The gallery each product gets.
 *
 * One HERO for each of the two device widths, a thumbnail, four gallery shots
 * and two detail shots.  The device split is what makes the storefront's
 * `X-Crystal-Device` header observable: a mobile request must come back with
 * the mobile hero and not merely a narrower copy of the desktop one, and with
 * only `all` rows in the table that path is never taken.
 *
 * `purpose` is one of HERO / GALLERY / THUMBNAIL / BANNER / DETAIL, which is
 * the list the console's media editor offers.  Anything else here would be a
 * row an operator can see and cannot re-save.
 */
const PRODUCT_SHOTS = [
  { purpose: 'HERO', device: 'desktop', file: 'hero-desktop', w: 1920, h: 900, alt: 'hero' },
  { purpose: 'HERO', device: 'mobile', file: 'hero-mobile', w: 1080, h: 1350, alt: 'hero' },
  { purpose: 'THUMBNAIL', device: 'all', file: 'thumb', w: 480, h: 480, alt: 'thumbnail' },
  // MAIN - the studio set, shown as the row of squares at the top of the
  // product page. These go to product_images, not media_assets.
  { kind: 'MAIN', device: 'all', file: 'front', w: 1200, h: 1200, alt: 'seen from the front' },
  { kind: 'MAIN', device: 'all', file: 'back', w: 1200, h: 1200, alt: 'seen from the back' },
  { kind: 'MAIN', device: 'all', file: 'angle', w: 1200, h: 1200, alt: 'three quarter view' },
  { kind: 'MAIN', device: 'all', file: 'lifestyle', w: 1600, h: 1200, alt: 'in use' },
  /*
   * The DETAIL run is the ADVERTISING page, not the studio set: full width
   * panels with the copy burnt into the artwork, read one under another.
   * That is what the gallery tab shows, so there have to be enough of them
   * for the tab to read as a page rather than as two stray pictures.
   */
  { kind: 'ADVERT', device: 'all', file: 'detail-display', w: 1600, h: 900, alt: 'the display' },
  { kind: 'ADVERT', device: 'all', file: 'detail-camera', w: 1600, h: 900, alt: 'the camera system' },
  { kind: 'ADVERT', device: 'all', file: 'detail-performance', w: 1600, h: 900, alt: 'performance' },
  { kind: 'ADVERT', device: 'all', file: 'detail-battery', w: 1600, h: 900, alt: 'battery and charging' },
  { kind: 'ADVERT', device: 'all', file: 'detail-ports', w: 1400, h: 900, alt: 'ports and connectors' },
  { kind: 'ADVERT', device: 'all', file: 'detail-colours', w: 1400, h: 900, alt: 'finish options' }
];

/**
 * The pictures published beside an OS release.
 *
 * A release note on its own is a wall of text, and Support / Crystal OS is a
 * marketing page rather than a changelog - so every published version carries
 * a short run of screens to show alongside the words.
 */
const OS_SHOTS = [
  { file: 'feature-1', w: 1600, h: 900, alt: 'the new home screen' },
  { file: 'feature-2', w: 1600, h: 900, alt: 'privacy controls' },
  { file: 'feature-3', w: 1600, h: 900, alt: 'the redesigned camera app' }
];

exports.seed = async function seed(knex) {
  const random = rng(20260826);

  /* ------------------------------------------------------------------ */
  /*  Crystal OS, and which product got which build                      */
  /* ------------------------------------------------------------------ */

  const osRows = OS_VERSIONS.map(function (row) {
    return {
      version: row.version,
      title: row.title,
      description: row.description,
      highlights: row.highlights,
      cover_image: row.cover_image,
      release_date: row.release_date,
      status: row.status || 'PUBLISHED'
    };
  });

  const osVersions = await knex('os_versions').insert(osRows).returning(['id', 'version', 'release_date', 'status']);

  const products = await knex('products')
    .orderBy('id')
    .select('id', 'slug', 'name', 'category_id', 'series_id', 'release_date');

  const categories = await knex('product_categories').select('id', 'slug', 'name', 'type');
  const series = await knex('product_series').select('id', 'slug', 'name', 'category_id');

  function osByVersion(version) {
    return osVersions.find(function (row) { return row.version === version; });
  }

  /*
   * The rollout, per device.
   *
   * A device's history has two halves, and missing either one empties the OS
   * tab on exactly the products people look at:
   *
   *   the build it SHIPPED WITH - the newest version that already existed on
   *   the day the device was released, dated that day rather than the build's
   *   own release date, because that is when this device got it
   *
   *   every build released SINCE - the updates it has been sent
   *
   * Keeping only the second half is the obvious rule and it is wrong: the
   * newest handset in the catalogue has had no updates yet, so it comes out
   * with an empty history while the six year old camera has four entries.
   *
   * The DRAFT preview reaches nothing at all, because a build that has not
   * been published has by definition not rolled out to anybody.
   */
  const history = [];
  const published = osVersions
    .filter(function (row) { return row.status === 'PUBLISHED'; })
    .sort(function (a, b) { return Date.parse(a.release_date) - Date.parse(b.release_date); });

  products.forEach(function (product, index) {
    const productReleased = Date.parse(product.release_date + 'T00:00:00Z');
    const isTelevision = String(product.slug).indexOf('vision-') === 0;

    /* The newest build that existed when this device shipped, if any did. */
    let shippedWith = null;
    published.forEach(function (version) {
      if (Date.parse(version.release_date + 'T00:00:00Z') <= productReleased) shippedWith = version;
    });

    let order = 0;

    if (shippedWith) {
      order += 10;
      history.push({
        product_id: product.id,
        /*
         * The version as a STRING, and it is the DEVICE's own.
         *
         * It is seeded from the Crystal OS release the device shipped with
         * because that is realistic for a handset, but nothing joins the
         * two: a television reports a firmware build that is not a Crystal
         * OS version at all, which is exactly why this column is text.
         */
        os_version: shippedWith.version,
        release_date: product.release_date,
        content: product.name + ' shipped with this build. '
          + 'No update was required at first use.',
        pub_approve_number: null,
        sort_order: order
      });
    }

    published.forEach(function (version) {
      const versionReleased = Date.parse(version.release_date + 'T00:00:00Z');
      if (versionReleased <= productReleased) return;

      /*
       * Televisions trail the handsets by about a month, which is the real
       * policy: a set-top rollback is a service visit, so those builds get a
       * longer soak before they go out.
       */
      const stagger = (isTelevision ? 28 : 0) + (index % 12);
      const rolledOut = new Date(versionReleased + stagger * 86400000);

      order += 10;

      /*
       * The notice, as PROSE rather than as a bullet list.
       *
       * What is published against a device is a paragraph a customer reads,
       * not the release note for the build - the build has its own page
       * under Support / Crystal OS, and repeating it here would be the same
       * text on nineteen product pages.
       */
      history.push({
        product_id: product.id,
        os_version: version.version,
        release_date: rolledOut.toISOString().slice(0, 10),
        content: product.name + ' received ' + version.title + ' on this date. '
          + (isTelevision
            ? 'The television line is staged one month behind the handsets: a '
              + 'set-top rollback is a service visit, so these builds get a longer soak.'
            : 'The update installs overnight and keeps your settings.'),
        /*
         * The publication approval reference for the notice. Only the
         * rollouts carry one - the build a device shipped with was never
         * announced separately - so the column is genuinely mixed rather
         * than uniformly full, which is what it will look like in
         * production.
         */
        pub_approve_number: 'PA-' + String(product.id).padStart(3, '0')
          + '-' + String(version.version).replace(/\./g, ''),
        sort_order: order
      });
    });
  });

  if (history.length) await knex('product_os_history').insert(history);

  /* ------------------------------------------------------------------ */
  /*  the blog                                                           */
  /* ------------------------------------------------------------------ */

  const editor = await knex('managers').where('username', 'editor').first('id', 'name');
  const ops = await knex('managers').where('username', 'ops').first('id', 'name');

  const articleRows = ARTICLES.map(function (article, index) {
    const slug = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 200);

    /*
     * Most posts are published; two are not, so the console has something to
     * move through the DRAFT -> REVIEW -> PUBLISHED transitions the blog
     * service enforces, and so /blog can be shown to omit them.
     */
    let status = 'PUBLISHED';
    if (index === ARTICLES.length - 1) status = 'DRAFT';
    else if (index === ARTICLES.length - 2) status = 'REVIEW';

    const byOps = index % 3 === 1;

    return {
      title: article.title,
      slug: slug,
      cover_image: '/uploads/articles/' + slug + '.svg',
      cover_image_mobile: '/uploads/articles/' + slug + '-mobile.svg',
      summary: article.summary,
      content: article.content,
      author: byOps && ops ? ops.name : (editor ? editor.name : 'Crystal'),
      author_id: byOps && ops ? ops.id : (editor ? editor.id : null),
      category: article.category,
      status: status,
      // Plausible rather than random: older posts have had longer to be read.
      view_count: status === 'PUBLISHED' ? 120 + article.days * 9 + random(400) : 0,
      is_featured: !!article.featured && status === 'PUBLISHED',
      published_at: status === 'PUBLISHED' ? stampDaysAgo(article.days) : null,
      created_at: stampDaysAgo(article.days + 2)
    };
  });

  const articles = await knex('articles').insert(articleRows).returning(['id', 'slug', 'title', 'status']);

  /* ------------------------------------------------------------------ */
  /*  artwork                                                            */
  /* ------------------------------------------------------------------ */

  const media = [];

  /*
   * Products.  The folder is the product slug, matching the two cover images
   * seed 02 already wrote, so everything belonging to one product sits in one
   * directory and the placeholder generator gives them all the same hue.
   */
  /*
   * A product's HERO and THUMBNAIL slots stay in media_assets; its two own
   * runs - the studio set and the advertising panels - go to product_images,
   * which is a real relation rather than a polymorphic one.
   */
  const productImages = [];

  products.forEach(function (product) {
    PRODUCT_SHOTS.forEach(function (shot, order) {
      const file = '/uploads/products/' + product.slug + '/' + shot.file + '.svg';
      const alt = product.name + ' - ' + shot.alt;

      if (shot.kind) {
        productImages.push({
          product_id: product.id,
          kind: shot.kind,
          device_type: shot.device,
          file_path: file,
          alt_text: alt,
          width: shot.w,
          height: shot.h,
          sort_order: (order + 1) * 10
        });
        return;
      }

      media.push({
        owner_type: 'PRODUCT',
        owner_id: product.id,
        purpose: shot.purpose,
        device_type: shot.device,
        file_path: file,
        alt_text: alt,
        width: shot.w,
        height: shot.h,
        sort_order: (order + 1) * 10
      });
    });
  });

  /*
   * Series and categories get a banner per device width.  The series table
   * already carries `banner_image`; these are the additional assets a landing
   * page can rotate through, and they are what proves media_assets works for
   * an owner_type other than PRODUCT.
   */
  series.forEach(function (row) {
    media.push({
      owner_type: 'SERIES', owner_id: row.id, purpose: 'BANNER', device_type: 'desktop',
      file_path: '/uploads/series/' + row.slug + '-feature.svg',
      alt_text: row.name + ' series', width: 1920, height: 640, sort_order: 10
    });
    media.push({
      owner_type: 'SERIES', owner_id: row.id, purpose: 'BANNER', device_type: 'mobile',
      file_path: '/uploads/series/' + row.slug + '-feature-mobile.svg',
      alt_text: row.name + ' series', width: 1080, height: 1080, sort_order: 20
    });
  });

  /*
   * A SECTION'S OWN ADVERTISING RUN, which is what the top of a landing page
   * shows.
   *
   * Not a product photograph: these are pictures of a RANGE - the C9 line,
   * fast charging on the C7 Pro - and they belong to the section rather than
   * to any one product in it. The copy is burnt into the artwork, exactly as
   * it is on the product advertising run, so a slide needs nothing beyond
   * the image and somewhere to go.
   *
   * Per device width, because a 1920x760 banner on a phone is a strip.
   */
  const HERO_RUN = [
    { file: 'hero-range', alt: 'the range', link: null },
    { file: 'hero-feature', alt: 'a closer look', link: null },
    { file: 'hero-support', alt: 'service and support', link: '/support' }
  ];

  categories.forEach(function (row) {
    HERO_RUN.forEach(function (slide, order) {
      ['desktop', 'mobile'].forEach(function (device) {
        media.push({
          owner_type: 'CATEGORY',
          owner_id: row.id,
          purpose: 'HERO',
          device_type: device,
          file_path: '/uploads/categories/' + row.slug + '-' + slide.file
            + (device === 'mobile' ? '-mobile' : '') + '.svg',
          alt_text: row.name + ' - ' + slide.alt,
          link_url: slide.link,
          width: device === 'mobile' ? 1080 : 1920,
          height: device === 'mobile' ? 1350 : 760,
          sort_order: (order + 1) * 10
        });
      });
    });

    media.push({
      owner_type: 'CATEGORY', owner_id: row.id, purpose: 'BANNER', device_type: 'desktop',
      file_path: '/uploads/categories/' + row.slug + '-banner.svg',
      alt_text: row.name, width: 1920, height: 520, sort_order: 10
    });
    media.push({
      owner_type: 'CATEGORY', owner_id: row.id, purpose: 'BANNER', device_type: 'mobile',
      file_path: '/uploads/categories/' + row.slug + '-banner-mobile.svg',
      alt_text: row.name, width: 1080, height: 900, sort_order: 20
    });
  });

  /*
   * Crystal OS releases.  The cover image is a column on the version; these
   * are the screens the support page lays out beside the release notes, and
   * they are what proves media_assets carries an owner that is not part of
   * the catalogue at all.
   */
  osVersions.forEach(function (version) {
    if (version.status !== 'PUBLISHED') return;

    OS_SHOTS.forEach(function (shot, order) {
      media.push({
        owner_type: 'OS_VERSION',
        owner_id: version.id,
        purpose: 'GALLERY',
        device_type: 'all',
        file_path: '/uploads/os/crystal-os-' + version.version + '-' + shot.file + '.svg',
        alt_text: 'Crystal OS ' + version.version + ' - ' + shot.alt,
        width: shot.w,
        height: shot.h,
        sort_order: (order + 1) * 10
      });
    });
  });

  /*
   * Articles.  The cover lives on the article row itself; these are the
   * in-body figures, which is what the article detail endpoint returns
   * alongside the text.
   */
  articles.forEach(function (article) {
    media.push({
      owner_type: 'ARTICLE', owner_id: article.id, purpose: 'GALLERY', device_type: 'all',
      file_path: '/uploads/articles/' + article.slug + '-figure-1.svg',
      alt_text: article.title, width: 1600, height: 900, sort_order: 10
    });
    media.push({
      owner_type: 'ARTICLE', owner_id: article.id, purpose: 'GALLERY', device_type: 'all',
      file_path: '/uploads/articles/' + article.slug + '-figure-2.svg',
      alt_text: article.title, width: 1600, height: 900, sort_order: 20
    });
  });

  await knex('media_assets').insert(media);

  /* ------------------------------------------------------------------ */
  /*  the popup notices                                                  */
  /* ------------------------------------------------------------------ */

  /*
   * WHO EACH NOTICE IS FROM.
   *
   * The colour is what makes a list of ten announcements readable: a reader
   * looking for the service desk finds the amber ones before they have read a
   * single label. They are ordered the way an operations team would rank them
   * - the ones that affect a device you own first, the marketing last.
   */
  const originRows = await knex('notice_origins').insert([
    { code: 'CRYSTAL', name: 'Crystal', colour: '#0EA5E9', sort_order: 10 },
    { code: 'SERVICE', name: 'Service network', colour: '#F59E0B', sort_order: 20 },
    { code: 'OS_TEAM', name: 'Crystal OS', colour: '#8B5CF6', sort_order: 30 },
    { code: 'ESHOP', name: 'Crystal Eshop', colour: '#10B981', sort_order: 40 },
    { code: 'APPSTORE', name: 'Crystal Appstore', colour: '#EC4899', sort_order: 50 },
    { code: 'SECURITY', name: 'Security', colour: '#EF4444', sort_order: 60 },
    { code: 'REGULATORY', name: 'Regulatory', colour: '#64748B', sort_order: 70 }
  ]).returning(['id', 'code']);

  const originId = {};
  originRows.forEach(function (row) { originId[row.code] = row.id; });

  /*
   * TEN NOTICES, EIGHT OF THEM LIVE TODAY.
   *
   * The table used to be read with `.first()` - two live notices meant the
   * higher one won and the runner-up waited for it to expire - so three rows
   * were enough to seed it and only one was ever visible. Now that the
   * storefront reads the whole live set, three rows would prove nothing about
   * the list, the paging in the dialog or the notification page.
   *
   * The last two are still here and still not live: one written for next
   * month and one whose window has closed. A seed where everything is live
   * cannot show that the window works.
   */
  await knex('site_notices').insert([
    {
      title: 'Crystal OS 5.2 is rolling out',
      content:
        '<p>The newest Crystal OS reaches the C9 and C7 lines this week, and the rest of the range through the month.</p>'
        + '<p>Your product page lists the date your own model received it. Rollouts are staged, so a device that has not been offered the update yet has not been forgotten.</p>',
      origin_id: originId.OS_TEAM,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(2),
      ends_at: null,
      sort_order: 100
    },
    {
      title: 'Sign in from an unfamiliar device now asks for a code',
      content:
        '<p>A sign-in from a device we have not seen before is confirmed with a code sent to the phone number on your account.</p>'
        + '<p>Nothing changes on a device you already use. If you no longer have the number on file, change it under Settings before you next sign out.</p>',
      origin_id: originId.SECURITY,
      status: 'PUBLISHED',
      // The one notice on this list that genuinely has to be read.
      starts_at: stampDaysAgo(1),
      ends_at: stampDaysAgo(-14),
      sort_order: 95
    },
    {
      title: 'Shanghai Pudong centre has moved',
      content:
        '<p>The Pudong counter moved on Monday to a larger unit two streets east. The address on the service centre page is the new one.</p>'
        + '<p>Repairs booked at the old address are waiting for you at the new one - bring your ticket number.</p>',
      origin_id: originId.SERVICE,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(3),
      ends_at: stampDaysAgo(-10),
      sort_order: 90
    },
    {
      title: 'Screen repair prices published for the C9 line',
      content:
        '<p>The approved price for a C9 and C9 Pro screen, part and labour listed separately, is on the repair pricing page.</p>'
        + '<p>Repairs inside warranty remain free. The approval number beside each line is the reference the figure was published under.</p>',
      origin_id: originId.REGULATORY,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(5),
      ends_at: null,
      sort_order: 80
    },
    {
      title: 'Free delivery on every Eshop order',
      content:
        '<p>Delivery is free on everything in the Crystal Eshop, with no minimum and no code to enter.</p>'
        + '<p>The Eshop is a separate system - the link in the header takes you there.</p>',
      origin_id: originId.ESHOP,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(9),
      ends_at: stampDaysAgo(-21),
      sort_order: 70
    },
    {
      title: 'Appstore purchases now follow your account, not your device',
      content:
        '<p>Sign in on a new or repaired device and everything you have bought re-downloads from the Purchases list.</p>'
        + '<p>Nothing needs to be transferred by hand, and nothing is lost when a device is replaced under warranty.</p>',
      origin_id: originId.APPSTORE,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(6),
      ends_at: null,
      sort_order: 60
    },
    {
      title: 'Saturday opening at every flagship centre',
      content:
        '<p>Flagship and factory service centres are now open from nine until six on Saturdays.</p>'
        + '<p>Collection points and authorised centres keep their weekday hours. Each centre lists its own on the service centre page.</p>',
      origin_id: originId.SERVICE,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(12),
      ends_at: null,
      sort_order: 50
    },
    {
      title: 'Registering a device earns 500 points',
      content:
        '<p>Registering records your warranty date against your account, so a lost receipt stops being a problem.</p>'
        + '<p>It takes about thirty seconds, and the points are spendable on licences and warranty extensions.</p>',
      origin_id: originId.CRYSTAL,
      status: 'PUBLISHED',
      starts_at: null,
      ends_at: null,
      sort_order: 40
    },
    {
      title: 'Service centres closed for the public holiday',
      content:
        '<p>All centres are closed on the first of the month and reopen the following morning.</p>'
        + '<p>Repairs already booked in will be ready as promised; walk-ins should come the day after.</p>',
      origin_id: originId.SERVICE,
      status: 'PUBLISHED',
      /*
       * Written in advance: published, but not live until it starts.
       * stampDaysAgo counts BACKWARDS, so the later date is the smaller
       * negative - getting that the wrong way round gives a window that ends
       * before it opens, and a notice that can never show.
       */
      starts_at: stampDaysAgo(-18),
      ends_at: stampDaysAgo(-20),
      sort_order: 30
    },
    {
      title: 'Winter sale on the C5 and C3',
      content: '<p>Both lines were reduced through January. The sale has now ended.</p>',
      origin_id: originId.CRYSTAL,
      status: 'PUBLISHED',
      // Its window has closed, so it is no longer live.
      starts_at: stampDaysAgo(60),
      ends_at: stampDaysAgo(30),
      sort_order: 20
    },

    /*
     * ENOUGH LIVE NOTICES TO OVERFLOW THE GREETING.
     *
     * The dialog shows six and links to the rest, so a seed with five live
     * notices demonstrates neither the limit nor the link - the footer count
     * was always absent and the scroll in the list column never appeared.
     * These take the live set past six, with several dated today so the
     * newest-first ordering has something to order.
     */
    {
      title: 'Crystal OS 5.2.1 fixes the camera timer',
      content:
        '<p>A point release went out this morning for every device already on 5.2. It fixes the timer resetting when the camera app is backgrounded, and a battery reading that could stick at one figure overnight.</p>'
        + '<p>It installs with the next scheduled update; nothing needs to be done.</p>',
      origin_id: originId.OS_TEAM,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(0),
      ends_at: null,
      sort_order: 98
    },
    {
      title: 'Karaoke licences are half price this week',
      content:
        '<p>A device licence for Crystal Vision panels and Box units is 250 points rather than 500 until Sunday.</p>'
        + '<p>Licences already issued are unaffected. Points are earned by registering a device and by signing in each day.</p>',
      origin_id: originId.CRYSTAL,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(0),
      ends_at: stampDaysAgo(-7),
      sort_order: 85
    },
    {
      title: 'Parts for the C3 are back in stock everywhere',
      content:
        '<p>Screens and batteries for the C3 were short at several centres through last month. Every authorised centre is stocked again.</p>'
        + '<p>Repairs that were waiting on a part have been contacted directly.</p>',
      origin_id: originId.SERVICE,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(4),
      ends_at: stampDaysAgo(-20),
      sort_order: 75
    },
    {
      title: 'The Eshop now shows repair prices on the product page',
      content:
        '<p>What a screen or a battery costs to replace is on the product page before you buy, not only after something breaks.</p>'
        + '<p>The figures are the same published approvals the support pages carry.</p>',
      origin_id: originId.CRYSTAL,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(7),
      ends_at: null,
      sort_order: 65
    },
    {
      title: 'Two-year warranty on Crystal Vision panels',
      content:
        '<p>Panels bought from this month carry twenty-four months rather than twelve. The panel, the stand and the remote are all covered.</p>'
        + '<p>Cover is recorded against the account the device is registered to, so there is no receipt to keep.</p>',
      origin_id: originId.REGULATORY,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(15),
      ends_at: null,
      sort_order: 55
    },
    {
      title: 'Chengdu service centre opens on the 12th',
      content:
        '<p>A tenth province joins the network. The Chengdu counter handles both smartphones and eproducts, and takes walk-ins from opening day.</p>'
        + '<p>It is on the service centre page with its hours and address.</p>',
      origin_id: originId.SERVICE,
      status: 'PUBLISHED',
      starts_at: stampDaysAgo(21),
      ends_at: null,
      sort_order: 45
    }
  ]);
  if (productImages.length) await knex('product_images').insert(productImages);
};
