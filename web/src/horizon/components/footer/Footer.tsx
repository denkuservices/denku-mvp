const Footer = () => {
  return (
    <div className="flex w-full flex-col items-center justify-between px-1 pb-0 pt-0 lg:px-8 xl:flex-row">
      <p className="mb-0 text-center text-sm font-medium text-gray-600 sm:!mb-0 md:text-lg">
        <span className="mb-0 text-center text-sm text-gray-600 sm:!mb-0 md:text-base">
          © 2026 Denku MVP
        </span>
      </p>
      <div>
        <ul className="flex flex-wrap items-center gap-3 sm:flex-nowrap md:gap-10">
          <li>
            <a
              target="blank"
              href="/support"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Support
            </a>
          </li>
          <li>
            <a
              target="blank"
              href="/terms"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Terms
            </a>
          </li>
          <li>
            <a
              target="blank"
              href="/privacy"
              className="text-base font-medium text-gray-600 hover:text-gray-600"
            >
              Privacy
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Footer;
