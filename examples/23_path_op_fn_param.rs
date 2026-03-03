mod foo {
    pub struct Bar {
        pub x: i32,
    }
    pub mod bar {
        pub struct Foo {
            pub bar: Bar,
            pub foo: i32,
        }
        impl Foo {
            pub fn new(bar: Bar, foo: i32) -> Self {
                Self { bar, foo }
            }
        }
    }
}

fn bar(x: foo::Bar) -> i32 {
    x.x
}

#[test]
fn test_example() {
    let x = foo::Bar { x: 1 };
    let y = foo::bar::Foo::new(x, 2);
    println!("{} {}", bar(x), bar(y.bar));
}
