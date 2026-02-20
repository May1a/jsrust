mod untrusted {
    mod no_panic {
        #[derive(Clone, Copy)]
        pub struct Slice<'a> {
            bytes: &'a [u8],
        }

        impl<'a> Slice<'a> {
            #[inline]
            pub const fn new(bytes: &'a [u8]) -> Self {
                Self { bytes }
            }

            #[inline]
            pub fn get(&self, i: usize) -> Option<&u8> {
                self.bytes.get(i)
            }

            #[inline]
            pub fn subslice(&self, r: core::ops::Range<usize>) -> Option<Self> {
                self.bytes.get(r).map(|bytes| Self { bytes })
            }

            #[inline]
            pub fn is_empty(&self) -> bool {
                self.bytes.is_empty()
            }

            #[inline]
            pub fn len(&self) -> usize {
                self.bytes.len()
            }

            #[inline]
            pub fn as_slice_less_safe(&self) -> &'a [u8] {
                self.bytes
            }
        }
    }

    use self::no_panic::Slice;

    #[derive(Clone, Copy)]
    pub struct Input<'a> {
        value: Slice<'a>,
    }

    impl core::fmt::Debug for Input<'_> {
        fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            f.debug_struct("Input").finish()
        }
    }

    impl<'a> Input<'a> {
        pub const fn from(bytes: &'a [u8]) -> Self {
            Self {
                value: Slice::new(bytes),
            }
        }

        #[inline]
        pub fn is_empty(&self) -> bool {
            self.value.is_empty()
        }

        #[inline]
        pub fn len(&self) -> usize {
            self.value.len()
        }

        pub fn read_all<F, R, E>(&self, incomplete_read: E, read: F) -> Result<R, E>
        where
            F: FnOnce(&mut Reader<'a>) -> Result<R, E>,
        {
            let mut input = Reader::new(*self);
            let result = read(&mut input)?;
            if input.at_end() {
                Ok(result)
            } else {
                Err(incomplete_read)
            }
        }

        #[inline]
        pub fn as_slice_less_safe(&self) -> &'a [u8] {
            self.value.as_slice_less_safe()
        }

        fn into_value(self) -> Slice<'a> {
            self.value
        }
    }

    impl<'a> From<&'a [u8]> for Input<'a> {
        #[inline]
        fn from(value: &'a [u8]) -> Self {
            Slice::new(value).into()
        }
    }

    impl<'a> From<Slice<'a>> for Input<'a> {
        #[inline]
        fn from(value: Slice<'a>) -> Self {
            Self { value }
        }
    }

    pub struct Reader<'a> {
        input: Slice<'a>,
        i: usize,
    }

    impl core::fmt::Debug for Reader<'_> {
        fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            f.debug_struct("Reader").finish()
        }
    }

    impl<'a> Reader<'a> {
        #[inline]
        pub fn new(input: Input<'a>) -> Self {
            Self {
                input: input.into_value(),
                i: 0,
            }
        }

        #[inline]
        pub fn at_end(&self) -> bool {
            self.i == self.input.len()
        }

        #[inline]
        pub fn peek(&self, b: u8) -> bool {
            match self.input.get(self.i) {
                Some(actual_b) => b == *actual_b,
                None => false,
            }
        }

        #[inline]
        pub fn read_byte(&mut self) -> Result<u8, EndOfInput> {
            match self.input.get(self.i) {
                Some(b) => {
                    self.i += 1;
                    Ok(*b)
                }
                None => Err(EndOfInput),
            }
        }

        #[inline]
        pub fn read_bytes(&mut self, num_bytes: usize) -> Result<Input<'a>, EndOfInput> {
            let new_i = self.i.checked_add(num_bytes).ok_or(EndOfInput)?;
            let ret = self
                .input
                .subslice(self.i..new_i)
                .map(From::from)
                .ok_or(EndOfInput)?;
            self.i = new_i;
            Ok(ret)
        }

        #[inline]
        pub fn read_bytes_to_end(&mut self) -> Input<'a> {
            let to_skip = self.input.len() - self.i;
            self.read_bytes(to_skip).expect("read_bytes_to_end invariant")
        }

        pub fn read_partial<F, R, E>(&mut self, read: F) -> Result<(Input<'a>, R), E>
        where
            F: FnOnce(&mut Reader<'a>) -> Result<R, E>,
        {
            let start = self.i;
            let r = read(self)?;
            let bytes_read = self
                .input
                .subslice(start..self.i)
                .expect("read_partial invariant")
                .into();
            Ok((bytes_read, r))
        }

        #[inline]
        pub fn skip(&mut self, num_bytes: usize) -> Result<(), EndOfInput> {
            self.read_bytes(num_bytes).map(|_| ())
        }

        #[inline]
        pub fn skip_to_end(&mut self) {
            let _ = self.read_bytes_to_end();
        }
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    pub struct EndOfInput;

    pub fn read_all_optional<'a, F, R, E>(
        input: Option<Input<'a>>,
        incomplete_read: E,
        read: F,
    ) -> Result<R, E>
    where
        F: FnOnce(Option<&mut Reader<'a>>) -> Result<R, E>,
    {
        match input {
            Some(input) => {
                let mut input = Reader::new(input);
                let result = read(Some(&mut input))?;
                if input.at_end() {
                    Ok(result)
                } else {
                    Err(incomplete_read)
                }
            }
            None => read(None),
        }
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum ParseError {
    EndOfInput,
    TrailingData,
    BadTag,
    LengthMismatch,
}

impl From<untrusted::EndOfInput> for ParseError {
    fn from(_: untrusted::EndOfInput) -> Self {
        ParseError::EndOfInput
    }
}

fn parse_prefixed_payload(input: &[u8]) -> Result<&[u8], ParseError> {
    let input = untrusted::Input::from(input);
    input.read_all(ParseError::TrailingData, |reader| {
        let tag = reader.read_byte()?;
        if tag != 0x01 {
            return Err(ParseError::BadTag);
        }
        let len = reader.read_byte()? as usize;
        let payload = reader.read_bytes(len)?;
        Ok(payload.as_slice_less_safe())
    })
}

fn parse_message(input: &[u8]) -> Result<(u8, u8, u8), ParseError> {
    let input = untrusted::Input::from(input);
    input.read_all(ParseError::TrailingData, |reader| {
        let version = reader.read_byte()?;
        let flags = reader.read_byte()?;
        let body_len = reader.read_byte()? as usize;
        let (bytes_read, checksum) = reader.read_partial(|r| -> Result<u8, ParseError> {
            let _data = r.read_bytes(body_len)?;
            let sum = r.read_byte()?;
            Ok(sum)
        })?;
        if bytes_read.len() != body_len + 1 {
            return Err(ParseError::LengthMismatch);
        }
        Ok((version, flags, checksum))
    })
}

fn parse_optional_checksum(input: Option<&[u8]>) -> Result<Option<u8>, ParseError> {
    let mapped = input.map(untrusted::Input::from);
    untrusted::read_all_optional(mapped, ParseError::TrailingData, |reader| match reader {
        Some(r) => Ok(Some(r.read_byte()?)),
        None => Ok(None),
    })
}

fn main() {
    let ok = parse_prefixed_payload(&[0x01, 0x05, b'h', b'e', b'l', b'l', b'o']);
    assert_eq!(ok, Ok(&b"hello"[..]));
    assert_eq!(
        parse_prefixed_payload(&[0x02, 0x01, b'x']),
        Err(ParseError::BadTag)
    );
    assert_eq!(
        parse_prefixed_payload(&[0x01, 0x01, b'x', 0x00]),
        Err(ParseError::TrailingData)
    );

    let msg = parse_message(&[0x01, 0xA0, 0x02, 0x11, 0x22, 0x33]);
    assert_eq!(msg, Ok((0x01, 0xA0, 0x33)));

    assert_eq!(parse_optional_checksum(Some(&[0x7F])), Ok(Some(0x7F)));
    assert_eq!(parse_optional_checksum(None), Ok(None));

    let mut reader = untrusted::Reader::new(untrusted::Input::from(&[0xAA, 0xBB]));
    assert!(reader.peek(0xAA));
    reader.skip(1).expect("skip should succeed");
    reader.skip_to_end();
    assert!(reader.at_end());

    println!("untrusted single-unit rustc example: ok");
}
